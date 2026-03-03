import fs from "fs";
import path from "path";
import _ from "lodash";
import { Db, Collection, MongoClient, Document, WithId, AnyError, InsertOneResult, DeleteResult } from "mongodb";
import { repeatString, connect as mongoConnect, normalizeConfig } from "./utils";
import { MongoConfig } from "./types";
import { migrationStub } from "./migration-stub";
import { glob } from "glob";


export type LogLevel = "system" | "user";
type LogFunction = ((level: LogLevel, message: string) => void) | null;

const defaultLog = (src: LogLevel, ...args: any[]): void => {
    const pad = repeatString(" ", src === "system" ? 4 : 2);
    console.log(pad, ...args);
};

export type MigrationFunction = (this: MigrationContext) => Promise<void>;

export interface Migration {
    id: string;
    up?: MigrationFunction;
    down?: MigrationFunction;
}

export type MigrationStatus = "ok" | "skip" | "error";

export interface MigrationResult {
    status: MigrationStatus;
    error?: Error;
    reason?: string;
    code?: "no_up" | "no_down" | "already_ran" | "not_in_recent_migrate";
}

export interface MigrationResults {
    [key: string]: MigrationResult;
}

export interface MigrationContext {
    db: Db;
    log: (message: string) => void;
    client: MongoClient;
}

export class Migrator {
    private disposed: boolean;
    private migrations: Migration[];
    private resultsByMigrationId: MigrationResults;
    private dbReady: Promise<void>;
    private db!: Db;
    private client!: MongoClient;
    private collName: string;
    private timeout?: number;
    private ranMigrations: { [key: string]: boolean } = {};
    private lastDirection?: "up" | "down";
    private log: LogFunction;

    constructor(dbConfig: MongoConfig, logFn?: LogFunction) {
        // this will throw in case of invalid values
        dbConfig = normalizeConfig(dbConfig);

        this.disposed = false;
        this.migrations = [];
        this.resultsByMigrationId = {};

        this.dbReady = mongoConnect(dbConfig).then((client: MongoClient) => {
            this.client = client;
            this.db = client.db();
        });

        this.collName = dbConfig.collection!;
        this.timeout = dbConfig.timeout;

        if (logFn || logFn === null) {
            this.log = logFn;
        } else {
            this.log = defaultLog;
        }
    }

    add(m: Migration): void {
        this.migrations.push(m);
    }

    bulkAdd(array: Migration[]): void {
        this.migrations = this.migrations.concat(array);
    }

    private coll(): Collection<Document> {
        return this.db.collection(this.collName);
    }

    private async runWhenReady(
        direction: "up" | "down",
        progress?: (id: string, result: MigrationResult) => void
    ): Promise<MigrationResults> {
        if (this.disposed) {
            throw new Error("This migrator is disposed and cannot be used anymore");
        }
        await this.dbReady;
        this.ranMigrations = {};
        const docs = await this.coll().find().toArray();
        for (const doc of docs) {
            this.ranMigrations[doc.id] = true;
        }
        return this.run(direction, progress);
    }

    private async run(direction: "up" | "down", progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        let m: Migration[];
        if (direction === "down") {
            m = this.migrations
                .reverse()
                .filter((m) => {
                    const status = this.resultsByMigrationId[m.id]?.status;
                    return status && status !== "skip";
                });
        } else {
            direction = "up";
            this.resultsByMigrationId = {};
            m = this.migrations;
        }
        this.lastDirection = direction;

        const logFn = this.log;
        const log = (src: LogLevel) => {
            return (msg: string) => {
                logFn?.(src, msg);
            };
        };
        const userLog = log("user");
        const systemLog = log("system");

        const migrationsCollection = this.coll();

        for (const migration of m) {
            const migrationDone = async (res: MigrationResult): Promise<void> => {
                this.resultsByMigrationId[migration.id] = res;
                progress?.(migration.id, res);
                let msg = `Migration '${migration.id}': ${res.status}`;
                if (res.status === "skip") {
                    msg += ` (${res.reason})`;
                }
                systemLog(msg);
                if (res.status === "error") {
                    systemLog("  " + res.error);
                }
                if (res.status === "ok" || (res.status === "skip" && (res.code === "no_up" || res.code === "no_down"))) {
                    await this.updateMigrationRecord(direction, migration.id);
                }
            };

            const fn = migration[direction];
            const id = migration.id;

            let skipReason: string | null = null;
            let skipCode: "no_up" | "no_down" | "already_ran" | "not_in_recent_migrate" | null = null;
            if (!fn) {
                skipReason = `no migration function for direction ${direction}`;
                skipCode = `no_${direction}` as "no_up" | "no_down";
            }
            if (direction === "up" && id in this.ranMigrations) {
                skipReason = "migration already ran";
                skipCode = "already_ran";
            }
            if (direction === "down" && !(id in this.resultsByMigrationId)) {
                skipReason = "migration wasn't in the recent `migrate` run";
                skipCode = "not_in_recent_migrate";
            }
            if (skipReason) {
                await migrationDone({ status: "skip", reason: skipReason, code: skipCode || undefined });
                continue;
            }

            const context: MigrationContext = { db: this.db, log: userLog, client: this.client };
            let timeoutId;

            const migrationAndTimeoutPromise = Promise.race([
                fn!.call(context),
                ...(this.timeout
                    ? [
                          new Promise((_, reject) => {
                              timeoutId = setTimeout(() => {
                                  reject(new Error("migration timed-out"));
                              }, this.timeout);
                          }),
                      ]
                    : []),
            ]);

            try {
                await migrationAndTimeoutPromise;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }

                await migrationDone({ status: "ok" });
            } catch (err) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }
                await migrationDone({ status: "error", error: err as Error });
                throw err;
            }
        }

        return this.resultsByMigrationId;
    }

    private async updateMigrationRecord(direction: "up" | "down", id: string): Promise<void> {
        if (direction === "up") {
            await this.coll().insertOne({ id });
        } else {
            await this.coll().deleteMany({ id });
        }
    }

    async migrate(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        return this.runWhenReady("up", progress);
    }

    async rollback(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        if (this.lastDirection !== "up") {
            throw new Error("Rollback can only be ran after migrate");
        }
        return this.runWhenReady("down", progress);
    }

    loadMigrationFiles(pattern: string): Array<{ number: number | null; module: any }> {
        return glob
            .sync(pattern, { absolute: true })
            .map((filePath) => {
                const numberText = path.basename(filePath).match(/^(\d+)/)?.[1];
                const number = numberText ? parseInt(numberText, 10) : null;
                return { number, module: require(filePath) };
            })
            .sort((item1, item2) => (item1.number || 0) - (item2.number || 0));
    }

    async runFromDir(dir: string, progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        const files = this.loadMigrationFiles(path.join(dir, "*.js"));
        this.bulkAdd(files.map(f => f.module))
        return await this.migrate(progress);
    }

    async runOne(migration: Migration, direction: "up" | "down" = "up"): Promise<MigrationResult> {
        this.add(migration);
        const results = await this.runWhenReady(direction);
        return results[migration.id];
    }

    create(dir: string, id: string): void {
        fs.mkdirSync(dir, { recursive: true, mode: 0o0774 });
        const files = this.loadMigrationFiles(path.join(dir, "*.js"));
        const maxNum = _.maxBy(files, "number")?.number ?? 0;
        const nextNum = maxNum + 1;
        const slug = (id || "").toLowerCase().replace(/\s+/, "-");
        const ext = "js";
        const fileName = path.join(dir, `${nextNum}-${slug}.${ext}`);
        const body = migrationStub(id);
        fs.writeFileSync(fileName, body);
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        await this.dbReady;
        this.client.close();
    }
}
