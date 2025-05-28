"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migrator = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const lodash_1 = __importDefault(require("lodash"));
const utils_1 = require("./utils");
const migration_stub_1 = require("./migration-stub");
const defaultLog = (src, ...args) => {
    const pad = (0, utils_1.repeatString)(" ", src === "system" ? 4 : 2);
    console.log(pad, ...args);
};
class Migrator {
    disposed;
    migrations;
    resultsByMigrationId;
    dbReady;
    db;
    client;
    collName;
    timeout;
    ranMigrations = {};
    lastDirection;
    log;
    constructor(dbConfig, logFn) {
        // this will throw in case of invalid values
        dbConfig = (0, utils_1.normalizeConfig)(dbConfig);
        this.disposed = false;
        this.migrations = [];
        this.resultsByMigrationId = {};
        this.dbReady = (0, utils_1.connect)(dbConfig).then((client) => {
            this.client = client;
            this.db = client.db();
        });
        this.collName = dbConfig.collection;
        this.timeout = dbConfig.timeout;
        if (logFn || logFn === null) {
            this.log = logFn;
        }
        else {
            this.log = defaultLog;
        }
    }
    add(m) {
        this.migrations.push(m);
    }
    bulkAdd(array) {
        this.migrations = this.migrations.concat(array);
    }
    coll() {
        return this.db.collection(this.collName);
    }
    async runWhenReady(direction, progress) {
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
    async run(direction, progress) {
        let m;
        if (direction === "down") {
            m = this.migrations
                .reverse()
                .filter((m) => {
                const status = this.resultsByMigrationId[m.id]?.status;
                return status && status !== "skip";
            });
        }
        else {
            direction = "up";
            this.resultsByMigrationId = {};
            m = this.migrations;
        }
        this.lastDirection = direction;
        const logFn = this.log;
        const log = (src) => {
            return (msg) => {
                logFn?.(src, msg);
            };
        };
        const userLog = log("user");
        const systemLog = log("system");
        const migrationsCollection = this.coll();
        for (const migration of m) {
            const migrationDone = async (res) => {
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
            let skipReason = null;
            let skipCode = null;
            if (!fn) {
                skipReason = `no migration function for direction ${direction}`;
                skipCode = `no_${direction}`;
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
            const context = { db: this.db, log: userLog, client: this.client };
            let timeoutId;
            const migrationAndTimeoutPromise = Promise.race([
                fn.call(context),
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
            }
            catch (err) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }
                await migrationDone({ status: "error", error: err });
                throw err;
            }
        }
        return this.resultsByMigrationId;
    }
    async updateMigrationRecord(direction, id) {
        if (direction === "up") {
            await this.coll().insertOne({ id });
        }
        else {
            await this.coll().deleteMany({ id });
        }
    }
    async migrate(progress) {
        return this.runWhenReady("up", progress);
    }
    async rollback(progress) {
        if (this.lastDirection !== "up") {
            throw new Error("Rollback can only be ran after migrate");
        }
        return this.runWhenReady("down", progress);
    }
    loadMigrationFiles(dir) {
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o0774 });
        const files = fs_1.default.readdirSync(dir);
        return files
            .filter((f) => [".js"].includes(path_1.default.extname(f)) && !f.startsWith("."))
            .map((f) => {
            const n = f.match(/^(\d+)/)?.[1];
            const number = n ? parseInt(n, 10) : null;
            return { number, name: f };
        })
            .filter((f) => !!f.name)
            .sort((f1, f2) => (f1.number || 0) - (f2.number || 0))
            .map((f) => {
            const fileName = path_1.default.join(dir, f.name);
            return { number: f.number, module: require(fileName) };
        });
    }
    async runFromDir(dir, progress) {
        const files = this.loadMigrationFiles(dir);
        this.bulkAdd(files.map(f => f.module));
        return await this.migrate(progress);
    }
    async runOne(migration, direction = "up") {
        this.add(migration);
        const results = await this.runWhenReady(direction);
        return results[migration.id];
    }
    create(dir, id) {
        const files = this.loadMigrationFiles(dir);
        const maxNum = lodash_1.default.maxBy(files, "number")?.number ?? 0;
        const nextNum = maxNum + 1;
        const slug = (id || "").toLowerCase().replace(/\s+/, "-");
        const ext = "js";
        const fileName = path_1.default.join(dir, `${nextNum}-${slug}.${ext}`);
        const body = (0, migration_stub_1.migrationStub)(id);
        fs_1.default.writeFileSync(fileName, body);
    }
    async dispose() {
        this.disposed = true;
        await this.dbReady;
        this.client.close();
    }
}
exports.Migrator = Migrator;
