import fs from "fs";
import path from "path";
import _ from "lodash";
import { Db, Collection, MongoClient, Document, WithId, AnyError, InsertOneResult, DeleteResult } from "mongodb";
import { repeatString, connect as mongoConnect, normalizeConfig } from "./utils";
import { MongoConfig } from "./types";
import { migrationStub } from "./migration-stub";

export type LogLevel = "system" | "user";
type LogFunction = ((level: LogLevel, message: string) => void) | null;

const defaultLog = (src: LogLevel, ...args: any[]): void => {
    const pad = repeatString(" ", src === "system" ? 4 : 2);
    console.log(pad, ...args);
};

type MigrationFunction = (this: MigrationContext) => Promise<void>;

interface Migration {
    id: string;
    up?: MigrationFunction;
    down?: MigrationFunction;
}

type MigrationStatus = "ok" | "skip" | "error";

interface MigrationResult {
    status: MigrationStatus;
    error?: Error;
    reason?: string;
    code?: "no_up" | "no_down" | "already_ran" | "not_in_recent_migrate";
}

interface MigrationResults {
    [key: string]: MigrationResult;
}

interface MigrationContext {
    db: Db;
    log: (message: string) => void;
    client: MongoClient;
}

export class Migrator {
    private _isDisposed: boolean;
    private _m: Migration[];
    private _result: MigrationResults;
    private _dbReady: Promise<void>;
    private _db!: Db;
    private _client!: MongoClient;
    private _collName: string;
    private _timeout?: number;
    private _ranMigrations: { [key: string]: boolean } = {};
    private _lastDirection?: "up" | "down";
    private log: LogFunction;

    constructor(dbConfig: MongoConfig, logFn?: LogFunction) {
        // this will throw in case of invalid values
        dbConfig = normalizeConfig(dbConfig);

        this._isDisposed = false;
        this._m = [];
        this._result = {};

        this._dbReady = mongoConnect(dbConfig).then((client: MongoClient) => {
            this._client = client;
            this._db = client.db();
        });

        this._collName = dbConfig.collection!;
        this._timeout = dbConfig.timeout;

        if (logFn || logFn === null) {
            this.log = logFn;
        } else {
            this.log = defaultLog;
        }
    }

    add(m: Migration): void {
        this._m.push(m);
    }

    bulkAdd(array: Migration[]): void {
        this._m = this._m.concat(array);
    }

    private _coll(): Collection<Document> {
        return this._db.collection(this._collName);
    }

    private async _runWhenReady(
        direction: "up" | "down",
        progress?: (id: string, result: MigrationResult) => void
    ): Promise<MigrationResults> {
        if (this._isDisposed) {
            throw new Error("This migrator is disposed and cannot be used anymore");
        }
        await this._dbReady;
        this._ranMigrations = {};
        const docs = await this._coll().find().toArray();
        for (const doc of docs) {
            this._ranMigrations[doc.id] = true;
        }
        return this._run(direction, progress);
    }

    private async _run(direction: "up" | "down", progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        let m: Migration[];
        if (direction === "down") {
            m = this._m
                .reverse()
                .filter((m) => {
                    const _r = this._result[m.id]?.status;
                    return _r && _r !== "skip";
                });
        } else {
            direction = "up";
            this._result = {};
            m = this._m;
        }
        this._lastDirection = direction;

        const logFn = this.log;
        const log = (src: LogLevel) => {
            return (msg: string) => {
                logFn?.(src, msg);
            };
        };
        const userLog = log("user");
        const systemLog = log("system");

        const migrationsCollection = this._coll();

        for (const migration of m) {
            const migrationDone = async (res: MigrationResult): Promise<void> => {
                this._result[migration.id] = res;
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
                    await this._updateMigrationRecord(direction, migration.id);
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
            if (direction === "up" && id in this._ranMigrations) {
                skipReason = "migration already ran";
                skipCode = "already_ran";
            }
            if (direction === "down" && !(id in this._result)) {
                skipReason = "migration wasn't in the recent `migrate` run";
                skipCode = "not_in_recent_migrate";
            }
            if (skipReason) {
                await migrationDone({ status: "skip", reason: skipReason, code: skipCode || undefined });
                continue;
            }

            const context: MigrationContext = { db: this._db, log: userLog, client: this._client };
            let timeoutId;

            const migrationAndTimeoutPromise = Promise.race([
                fn!.call(context),
                ...(this._timeout
                    ? [
                          new Promise((_, reject) => {
                              timeoutId = setTimeout(() => {
                                  reject(new Error("migration timed-out"));
                              }, this._timeout);
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

        return this._result;
    }

    async _updateMigrationRecord(direction: "up" | "down", id: string): Promise<void> {
        if (direction === "up") {
            await this._coll().insertOne({ id });
        } else {
            await this._coll().deleteMany({ id });
        }
    }

    async migrate(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        return this._runWhenReady("up", progress);
    }

    async rollback(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        if (this._lastDirection !== "up") {
            throw new Error("Rollback can only be ran after migrate");
        }
        return this._runWhenReady("down", progress);
    }

    private _loadMigrationFiles(dir: string): Array<{ number: number | null; module: any }> {
        fs.mkdirSync(dir, { recursive: true, mode: 0o0774 });
        const files = fs.readdirSync(dir);

        return files
            .filter((f) => [".js"].includes(path.extname(f)) && !f.startsWith("."))
            .map((f) => {
                const n = f.match(/^(\d+)/)?.[1];
                const number = n ? parseInt(n, 10) : null;
                return { number, name: f };
            })
            .filter((f) => !!f.name)
            .sort((f1, f2) => (f1.number || 0) - (f2.number || 0))
            .map((f) => {
                const fileName = path.join(dir, f.name);
                return { number: f.number, module: require(fileName) };
            });
    }

    async runFromDir(dir: string, progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults> {
        const files = this._loadMigrationFiles(dir);
        this.bulkAdd(files.map(f => f.module))
        return await this.migrate(progress);
    }

    async runOne(migration: Migration, direction: "up" | "down" = "up"): Promise<MigrationResult> {
        this.add(migration);
        const results = await this._runWhenReady(direction);
        return results[migration.id];
    }

    create(dir: string, id: string): void {
        const files = this._loadMigrationFiles(dir);
        const maxNum = _.maxBy(files, "number")?.number ?? 0;
        const nextNum = maxNum + 1;
        const slug = (id || "").toLowerCase().replace(/\s+/, "-");
        const ext = "js";
        const fileName = path.join(dir, `${nextNum}-${slug}.${ext}`);
        const body = migrationStub(id);
        fs.writeFileSync(fileName, body);
    }

    async dispose(): Promise<void> {
        this._isDisposed = true;
        await this._dbReady;
        this._client.close();
    }
}
