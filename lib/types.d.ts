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
export interface ReplicasetConfig {
    name: string;
    members: Array<{
        host: string;
        port?: number;
    }>;
}
