import fs from 'fs';
import path from 'path';
import Promise from 'bluebird';
import _ from 'lodash';
import { Db, Collection, MongoClient, Document, WithId, AnyError, Callback, InsertOneResult, DeleteResult } from 'mongodb-legacy';
import { repeatString, connect as mongoConnect, normalizeConfig } from './utils';
import { MongoConfig } from './url-builder';
import { mkdirp } from 'mkdirp';

// Import migration stub as a require since it uses module.exports
const migrationStub = require('./migration-stub');

type LogLevel = 'system' | 'user';
type LogFunction = ((level: LogLevel, message: string) => void) | null;

const defaultLog = (src: LogLevel, ...args: any[]): void => {
  const pad = repeatString(' ', src === 'system' ? 4 : 2);
  console.log(pad, ...args);
};

type MigrationCallback = (error?: Error) => void;

// A migration function can either:
// 1. Return a Promise<void>
// 2. Accept a callback parameter
type MigrationFunction = 
  | ((this: MigrationContext) => Promise<void>)
  | ((this: MigrationContext, done: MigrationCallback) => void);

interface Migration {
  id: string;
  up?: MigrationFunction;
  down?: MigrationFunction;
}

type MigrationStatus = 'ok' | 'skip' | 'error';

interface MigrationResult {
  status: MigrationStatus;
  error?: Error;
  reason?: string;
  code?: 'no_up' | 'no_down' | 'already_ran' | 'not_in_recent_migrate';
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
  private _lastDirection?: 'up' | 'down';
  private log: LogFunction;

  constructor(dbConfig: MongoConfig, logFn?: LogFunction) {
    // this will throw in case of invalid values
    dbConfig = normalizeConfig(dbConfig);

    this._isDisposed = false;
    this._m = [];
    this._result = {};

    this._dbReady = (Promise.fromCallback as any)((cb: (error?: Error) => void) => {
      mongoConnect(dbConfig, cb);
    }).then((client: MongoClient) => {
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
    // m must be an { id, up, down } object
    this._m.push(m);
  }

  bulkAdd(array: Migration[]): void {
    // array must be an Array of { id, up, down } objects
    this._m = this._m.concat(array);
  }

  private _coll(): Collection<Document> {
    return this._db.collection(this._collName);
  }

  private _runWhenReady(direction: 'up' | 'down', cb: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void {
    if (this._isDisposed) {
      return cb(new Error('This migrator is disposed and cannot be used anymore'));
    }
    const onSuccess = (): void => {
      this._ranMigrations = {};
      this._coll().find().toArray().then((docs: WithId<Document>[]) => {
        for (const doc of docs) {
          this._ranMigrations[doc.id] = true;
        }
        this._run(direction, cb, progress);
      }).catch((err: AnyError) => cb(err));
    };
    const onError = (err: Error): void => {
      cb(err);
    };
    this._dbReady.then(onSuccess, onError);
  }

  private _run(direction: 'up' | 'down', done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void {
    let m: Migration[];
    if (direction === 'down') {
      m = _(this._m)
        .reverse()
        .filter((m) => {
          const _r = this._result[m.id]?.status;
          return _r && _r !== 'skip';
        })
        .value();
    } else {
      direction = 'up';
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
    const userLog = log('user');
    const systemLog = log('system');

    let i = 0;
    const l = m.length;
    const migrationsCollection = this._coll();

    const migrationsCollectionUpdatePromises: Promise<any>[] = [];

    const handleMigrationDone = (id: string): void => {
      const p = direction === 'up'
        ? (Promise.fromCallback as any)((cb: Callback<InsertOneResult<Document>>) => {
            migrationsCollection.insertOne({ id }).then(
              result => cb(undefined, result),
              err => cb(err)
            );
          })
        : (Promise.fromCallback as any)((cb: Callback<DeleteResult>) => {
            migrationsCollection.deleteMany({ id }).then(
              result => cb(undefined, result),
              err => cb(err)
            );
          });

      migrationsCollectionUpdatePromises.push(p);
    };

    const allDone = (err?: Error): void => {
      Promise.all(migrationsCollectionUpdatePromises).then(() => {
        done(err, this._result);
      });
      // This return is necessary to prevent the above promise from being returned,
      // otherwise the promise will eventually be returned by the migration up/down function.
      // That would interfere with promise-based migrations, so explicitly return nothing here.
      return;
    };

    const runOne = (): void => {
      if (i >= l) {
        return allDone();
      }
      const migration = m[i];
      i += 1;

      const migrationDone = (res: MigrationResult): void => {
        this._result[migration.id] = res;
        _.defer(() => {
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

      let skipReason: string | null = null;
      let skipCode: 'no_up' | 'no_down' | 'already_ran' | 'not_in_recent_migrate' | null = null;
      if (!fn) {
        skipReason = `no migration function for direction ${direction}`;
        skipCode = `no_${direction}` as 'no_up' | 'no_down';
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
      let timeoutId: NodeJS.Timeout;

      const promiseAndDoneError = (): void => {
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

      const context: MigrationContext = { db: this._db, log: userLog, client: this._client };

      // We don't know if it's a promise or callback, so cast to a function with a return value of any
      const migrationFnWithUnknownReturn = fn as (this: MigrationContext, done: MigrationCallback) => any;
      const donePromise = migrationFnWithUnknownReturn.call(context, (err?: Error) => {
        didExecuteCallback = true;

        if (didTimeout) return;
        clearTimeout(timeoutId);

        if (didReturnPromise) {
          promiseAndDoneError();
          return;
        }

        if (err) {
          migrationDone({ status: 'error', error: err });
          allDone(err);
        } else {
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
          if (didTimeout) return;
          clearTimeout(timeoutId);
          migrationDone({ status: 'ok' });
          runOne();
        }).catch((err: Error) => {
          if (didTimeout) return;
          clearTimeout(timeoutId);
          migrationDone({ status: 'error', error: err });
          allDone(err);
        });
      }
    };

    runOne();
  }

  migrate(done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void {
    this._runWhenReady('up', done, progress);
  }

  rollback(done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void {
    if (this._lastDirection !== 'up') {
      return done(new Error('Rollback can only be ran after migrate'));
    }
    this._runWhenReady('down', done, progress);
  }

  private _loadMigrationFiles(dir: string, cb: (error?: Error, files?: Array<{ number: number | null; module: any }>) => void): void {
    mkdirp(dir, { mode: 0o0774 }).then(() => {
      fs.readdir(dir, (err: Error | null, files: string[]) => {
        if (err) {
          return cb(err);
        }
        const processed = files
          .filter((f) => ['.js', '.coffee'].includes(path.extname(f)) && !f.startsWith('.'))
          .map((f) => {
            const n = f.match(/^(\d+)/)?.[1];
            const number = n ? parseInt(n, 10) : null;
            return { number, name: f };
          })
          .filter((f) => !!f.name)
          .sort((f1, f2) => (f1.number || 0) - (f2.number || 0))
          .map((f) => {
            const fileName = path.join(dir, f.name);
            if (fileName.match(/\.coffee$/)) {
              require('coffeescript/register');
            }
            return { number: f.number, module: require(fileName) };
          });
        cb(undefined, processed);
      });
    }, cb);
  }

  runFromDir(dir: string, done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void {
    this._loadMigrationFiles(dir, (err, files) => {
      if (err) {
        return done(err);
      }
      this.bulkAdd(_.map(files, 'module'));
      this.migrate(done, progress);
    });
  }

  create(dir: string, id: string, done: (error?: Error) => void, coffeeScript: boolean = false): void {
    this._loadMigrationFiles(dir, (err, files) => {
      if (err) {
        return done(err);
      }
      const maxNum = _.maxBy(files, 'number')?.number ?? 0;
      const nextNum = maxNum + 1;
      const slug = (id || '').toLowerCase().replace(/\s+/, '-');
      const ext = coffeeScript ? 'coffee' : 'js';
      const fileName = path.join(dir, `${nextNum}-${slug}.${ext}`);
      const body = migrationStub(id, coffeeScript);
      fs.writeFile(fileName, body, (err) => done(err || undefined));
    });
  }

  dispose(cb?: (error?: Error) => void): void {
    this._isDisposed = true;
    const onSuccess = (): void => {
      try {
        this._client.close();
        cb?.(undefined);
      } catch (e: any) {
        cb?.(e);
      }
    };
    this._dbReady.then(onSuccess, cb);
  }
}