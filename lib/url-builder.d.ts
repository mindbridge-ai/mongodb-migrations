interface ReplicasetConfig {
    name: string;
    members: Array<{
        host: string;
        port?: number;
    }>;
}
export interface MongoConfig {
    url?: string;
    user?: string;
    password?: string;
    host?: string;
    port?: number;
    db?: string;
    replicaset?: ReplicasetConfig;
    ssl?: boolean;
    authDatabase?: string;
    collection?: string;
    timeout?: number;
    options?: Record<string, any>;
}
export declare function buildMongoConnString(config: MongoConfig): string;
export {};
