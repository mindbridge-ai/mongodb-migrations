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
const mkdirp_1 = require("mkdirp");
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
    _runWhenReady(direction, cb, progress) {
        if (this._isDisposed) {
            return cb(new Error('This migrator is disposed and cannot be used anymore'));
        }
        const onSuccess = () => {
            this._ranMigrations = {};
            this._coll().find().toArray().then((docs) => {
                for (const doc of docs) {
                    this._ranMigrations[doc.id] = true;
                }
                this._run(direction, cb, progress);
            }).catch((err) => cb(err));
        };
        const onError = (err) => {
            cb(err);
        };
        this._dbReady.then(onSuccess, onError);
    }
    _run(direction, done, progress) {
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
        let i = 0;
        const l = m.length;
        const migrationsCollection = this._coll();
        const migrationsCollectionUpdatePromises = [];
        const handleMigrationDone = (id) => {
            const p = direction === 'up'
                ? migrationsCollection.insertOne({ id })
                : migrationsCollection.deleteMany({ id });
            migrationsCollectionUpdatePromises.push(p);
        };
        const allDone = (err) => {
            Promise.all(migrationsCollectionUpdatePromises).then(() => {
                done(err, this._result);
            });
            // This return is necessary to prevent the above promise from being returned,
            // otherwise the promise will eventually be returned by the migration up/down function.
            // That would interfere with promise-based migrations, so explicitly return nothing here.
            return;
        };
        const runOne = () => {
            if (i >= l) {
                return allDone();
            }
            const migration = m[i];
            i += 1;
            const migrationDone = (res) => {
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
                    handleMigrationDone(migration.id);
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
                migrationDone({ status: 'skip', reason: skipReason, code: skipCode || undefined });
                return runOne();
            }
            let didTimeout = false;
            let didReturnPromise = false;
            let didExecuteCallback = false;
            let timeoutId;
            const promiseAndDoneError = () => {
                const err = new Error("Migration called done() AND returned a promise");
                migrationDone({ status: 'error', error: err });
                allDone(err);
            };
            if (this._timeout) {
                timeoutId = setTimeout(() => {
                    didTimeout = true;
                    const err = new Error("migration timed-out");
                    migrationDone({ status: 'error', error: err });
                    allDone(err);
                }, this._timeout);
            }
            const context = { db: this._db, log: userLog, client: this._client };
            // We don't know if it's a promise or callback, so cast to a function with a return value of any
            const migrationFnWithUnknownReturn = fn;
            const donePromise = migrationFnWithUnknownReturn.call(context, (err) => {
                didExecuteCallback = true;
                if (didTimeout)
                    return;
                clearTimeout(timeoutId);
                if (didReturnPromise) {
                    promiseAndDoneError();
                    return;
                }
                if (err) {
                    migrationDone({ status: 'error', error: err });
                    allDone(err);
                }
                else {
                    migrationDone({ status: 'ok' });
                    runOne();
                }
            });
            if (donePromise && donePromise.then instanceof Function) {
                didReturnPromise = true;
                if (didExecuteCallback) {
                    promiseAndDoneError();
                    return;
                }
                donePromise.then(() => {
                    if (didTimeout)
                        return;
                    clearTimeout(timeoutId);
                    migrationDone({ status: 'ok' });
                    runOne();
                }).catch((err) => {
                    if (didTimeout)
                        return;
                    clearTimeout(timeoutId);
                    migrationDone({ status: 'error', error: err });
                    allDone(err);
                });
            }
        };
        runOne();
    }
    migrate(done, progress) {
        this._runWhenReady('up', done, progress);
    }
    rollback(done, progress) {
        if (this._lastDirection !== 'up') {
            return done(new Error('Rollback can only be ran after migrate'));
        }
        this._runWhenReady('down', done, progress);
    }
    _loadMigrationFiles(dir, cb) {
        (0, mkdirp_1.mkdirp)(dir, { mode: 0o0774 }).then(() => {
            fs_1.default.readdir(dir, (err, files) => {
                if (err) {
                    return cb(err);
                }
                const processed = files
                    .filter((f) => ['.js', '.coffee'].includes(path_1.default.extname(f)) && !f.startsWith('.'))
                    .map((f) => {
                    const n = f.match(/^(\d+)/)?.[1];
                    const number = n ? parseInt(n, 10) : null;
                    return { number, name: f };
                })
                    .filter((f) => !!f.name)
                    .sort((f1, f2) => (f1.number || 0) - (f2.number || 0))
                    .map((f) => {
                    const fileName = path_1.default.join(dir, f.name);
                    if (fileName.match(/\.coffee$/)) {
                        require('coffeescript/register');
                    }
                    return { number: f.number, module: require(fileName) };
                });
                cb(undefined, processed);
            });
        }, cb);
    }
    runFromDir(dir, done, progress) {
        this._loadMigrationFiles(dir, (err, files) => {
            if (err) {
                return done(err);
            }
            this.bulkAdd(lodash_1.default.map(files, 'module'));
            this.migrate(done, progress);
        });
    }
    create(dir, id, done, coffeeScript = false) {
        this._loadMigrationFiles(dir, (err, files) => {
            if (err) {
                return done(err);
            }
            const maxNum = lodash_1.default.maxBy(files, 'number')?.number ?? 0;
            const nextNum = maxNum + 1;
            const slug = (id || '').toLowerCase().replace(/\s+/, '-');
            const ext = coffeeScript ? 'coffee' : 'js';
            const fileName = path_1.default.join(dir, `${nextNum}-${slug}.${ext}`);
            const body = migrationStub(id, coffeeScript);
            fs_1.default.writeFile(fileName, body, (err) => done(err || undefined));
        });
    }
    async dispose() {
        this._isDisposed = true;
        await this._dbReady;
        this._client.close();
    }
}
exports.Migrator = Migrator;
