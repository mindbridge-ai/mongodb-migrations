import { Db, MongoClient } from "mongodb";
import { MongoConfig } from "./types";
export type LogLevel = "system" | "user";
type LogFunction = ((level: LogLevel, message: string) => void) | null;
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
export declare class Migrator {
    private disposed;
    private migrations;
    private resultsByMigrationId;
    private dbReady;
    private db;
    private client;
    private collName;
    private timeout?;
    private ranMigrations;
    private lastDirection?;
    private log;
    constructor(dbConfig: MongoConfig, logFn?: LogFunction);
    add(m: Migration): void;
    bulkAdd(array: Migration[]): void;
    private coll;
    private runWhenReady;
    private run;
    private updateMigrationRecord;
    migrate(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults>;
    rollback(progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults>;
    loadMigrationFiles(pattern: string): Array<{
        number: number | null;
        module: any;
    }>;
    runFromDir(dir: string, progress?: (id: string, result: MigrationResult) => void): Promise<MigrationResults>;
    runOne(migration: Migration, direction?: "up" | "down"): Promise<MigrationResult>;
    create(dir: string, id: string): void;
    dispose(): Promise<void>;
}
export {};
