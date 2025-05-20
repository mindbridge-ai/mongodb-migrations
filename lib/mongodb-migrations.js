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
// Import migration stub as a require since it uses module.exports
const migrationStub = require('./migration-stub');
const defaultLog = (src, ...args) => {
    const pad = (0, utils_1.repeatString)(' ', src === 'system' ? 4 : 2);
    console.log(pad, ...args);
};
class Migrator {
    _isDisposed;
    _m;
    _result;
    _dbReady;
    _db;
    _client;
    _collName;
    _timeout;
    _ranMigrations = {};
    _lastDirection;
    log;
    constructor(dbConfig, logFn) {
        // this will throw in case of invalid values
        dbConfig = (0, utils_1.normalizeConfig)(dbConfig);
        this._isDisposed = false;
        this._m = [];
        this._result = {};
        this._dbReady = (0, utils_1.connect)(dbConfig).then((client) => {
            this._client = client;
            this._db = client.db();
        });
        this._collName = dbConfig.collection;
        this._timeout = dbConfig.timeout;
        if (logFn || logFn === null) {
            this.log = logFn;
        }
        else {
            this.log = defaultLog;
        }
    }
    add(m) {
        // m must be an { id, up, down } object
        this._m.push(m);
    }
    bulkAdd(array) {
        // array must be an Array of { id, up, down } objects
        this._m = this._m.concat(array);
    }
    _coll() {
        return this._db.collection(this._collName);
    }
    async _runWhenReady(direction, progress) {
        if (this._isDisposed) {
            throw new Error('This migrator is disposed and cannot be used anymore');
        }
        await this._dbReady;
        this._ranMigrations = {};
        const docs = await this._coll().find().toArray();
        for (const doc of docs) {
            this._ranMigrations[doc.id] = true;
        }
        return this._run(direction, progress);
    }
    async _run(direction, progress) {
        let m;
        if (direction === 'down') {
            m = (0, lodash_1.default)(this._m)
                .reverse()
                .filter((m) => {
                const _r = this._result[m.id]?.status;
                return _r && _r !== 'skip';
            })
                .value();
        }
        else {
            direction = 'up';
            this._result = {};
            m = this._m;
        }
        this._lastDirection = direction;
        const logFn = this.log;
        const log = (src) => {
            return (msg) => {
                logFn?.(src, msg);
            };
        };
        const userLog = log('user');
        const systemLog = log('system');
        const migrationsCollection = this._coll();
        for (const migration of m) {
            const migrationDone = async (res) => {
                this._result[migration.id] = res;
                lodash_1.default.defer(() => {
                    progress?.(migration.id, res);
                });
                let msg = `Migration '${migration.id}': ${res.status}`;
                if (res.status === 'skip') {
                    msg += ` (${res.reason})`;
                }
                systemLog(msg);
                if (res.status === 'error') {
                    systemLog('  ' + res.error);
                }
                if (res.status === 'ok' || (res.status === 'skip' && (res.code === 'no_up' || res.code === 'no_down'))) {
                    await this._updateMigrationRecord(direction, migration.id);
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
            if (direction === 'up' && id in this._ranMigrations) {
                skipReason = "migration already ran";
                skipCode = 'already_ran';
            }
            if (direction === 'down' && !(id in this._result)) {
                skipReason = "migration wasn't in the recent `migrate` run";
                skipCode = 'not_in_recent_migrate';
            }
            if (skipReason) {
                await migrationDone({ status: 'skip', reason: skipReason, code: skipCode || undefined });
                continue;
            }
            const context = { db: this._db, log: userLog, client: this._client };
            let timeoutId;
            const migrationAndTimeoutPromise = Promise.race([
                fn.call(context),
                ...(this._timeout
                    ? [
                        new Promise((_, reject) => {
                            timeoutId = setTimeout(() => {
                                reject(new Error("migration timed-out"));
                            }, this._timeout);
                        })
                    ]
                    : [])
            ]);
            try {
                await migrationAndTimeoutPromise;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }
                await migrationDone({ status: 'ok' });
            }
            catch (err) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }
                await migrationDone({ status: 'error', error: err });
                throw err;
            }
        }
        return this._result;
    }
    async _updateMigrationRecord(direction, id) {
        if (direction === 'up') {
            await this._coll().insertOne({ id });
        }
        else {
            await this._coll().deleteMany({ id });
        }
    }
    async migrate(progress) {
        return this._runWhenReady('up', progress);
    }
    async rollback(progress) {
        if (this._lastDirection !== 'up') {
            throw new Error('Rollback can only be ran after migrate');
        }
        return this._runWhenReady('down', progress);
    }
    _loadMigrationFiles(dir) {
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o0774 });
        const files = fs_1.default.readdirSync(dir);
        return files
            .filter((f) => ['.js'].includes(path_1.default.extname(f)) && !f.startsWith('.'))
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
        const files = this._loadMigrationFiles(dir);
        this.bulkAdd(lodash_1.default.map(files, 'module'));
        return await this.migrate(progress);
    }
    async runOne(migration, direction = 'up') {
        this.add(migration);
        const results = await this._runWhenReady(direction);
        return results[migration.id];
    }
    create(dir, id) {
        const files = this._loadMigrationFiles(dir);
        const maxNum = lodash_1.default.maxBy(files, 'number')?.number ?? 0;
        const nextNum = maxNum + 1;
        const slug = (id || '').toLowerCase().replace(/\s+/, '-');
        const ext = 'js';
        const fileName = path_1.default.join(dir, `${nextNum}-${slug}.${ext}`);
        const body = migrationStub(id);
        fs_1.default.writeFileSync(fileName, body);
    }
    async dispose() {
        this._isDisposed = true;
        await this._dbReady;
        this._client.close();
    }
}
exports.Migrator = Migrator;
