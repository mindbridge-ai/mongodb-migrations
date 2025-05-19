import _ from 'lodash';

interface ReplicasetConfig {
  name: string;
  members: Array<{ host: string; port?: number }>;
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

function buildHost(opts: { host: string; port?: number }): string {
  let { host, port } = opts;
  if (port) {
    host += ':' + port;
  }
  return host;
}

export function buildMongoConnString(config: MongoConfig): string {
  if (config.url) {
    return config.url;
  }

  const hasUser = !!config.user;
  const { replicaset } = config;

  let s = 'mongodb://';

  if (hasUser) {
    s += config.user;
  }

  if (config.password) {
    if (!hasUser) {
      throw new Error('`password` provided but `user` is not');
    }
    s += ':' + config.password;
  }

  if (hasUser) {
    s += '@';
  }

  if (replicaset) {
    s += replicaset.members.map(buildHost).join(',');
  } else {
    s += buildHost(config as { host: string; port?: number });
  }

  s += '/';

  if (config.db) {
    s += config.db;
  }

  const params: string[] = [];

  if (replicaset) {
    params.push(`replicaSet=${replicaset.name}`);
  }

  if (config.ssl) {
    params.push('ssl=true');
  }

  if (config.authDatabase) {
    params.push(`authSource=${config.authDatabase}`);
  }

  if (params.length > 0) {
    s += '?' + params.join('&');
  }

  return s;
}
