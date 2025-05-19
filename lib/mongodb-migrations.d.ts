import { Db, MongoClient } from 'mongodb-legacy';
import { MongoConfig } from './url-builder';
export type LogLevel = 'system' | 'user';
type LogFunction = ((level: LogLevel, message: string) => void) | null;
type MigrationCallback = (error?: Error) => void;
type MigrationFunction = ((this: MigrationContext) => Promise<void>) | ((this: MigrationContext, done: MigrationCallback) => void);
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
export declare class Migrator {
    private _isDisposed;
    private _m;
    private _result;
    private _dbReady;
    private _db;
    private _client;
    private _collName;
    private _timeout?;
    private _ranMigrations;
    private _lastDirection?;
    private log;
    constructor(dbConfig: MongoConfig, logFn?: LogFunction);
    add(m: Migration): void;
    bulkAdd(array: Migration[]): void;
    private _coll;
    private _runWhenReady;
    private _run;
    migrate(done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void;
    rollback(done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void;
    private _loadMigrationFiles;
    runFromDir(dir: string, done: (error?: Error, results?: MigrationResults) => void, progress?: (id: string, result: MigrationResult) => void): void;
    create(dir: string, id: string, done: (error?: Error) => void): void;
    dispose(): Promise<void>;
}
export {};
