import { MongoClient } from 'mongodb';
import * as urlBuilder from './url-builder';
import _ from 'lodash';

const DEFAULT_POOL_SIZE = 5;
const DEFAULT_COLLECTION = '_migrations';

// This is a utility backward-compat method,
// it shouldn't be used directly
export function _buildOptions(config: any): any {
  const options = config.options || {};
  const { maxPoolSize } = config;
  if (maxPoolSize !== undefined && maxPoolSize !== null) {
    console.warn(`\n      The \`maxPoolSize\` config param is deprecated.\n      Use \`options: { maxPoolSize: maxPoolSize }\` instead.\n    `);
    if (_.get(options, 'server.maxPoolSize') || _.get(options, 'maxPoolSize')) {
      console.warn(`\n        The \`maxPoolSize\` is overriding the \`options: { maxPoolSize: maxPoolSize }\` value.\n      `);
    }
    _.set(options, 'maxPoolSize', maxPoolSize);
  }
  if (!_.get(options, 'maxPoolSize') && !_.get(options, 'server.maxPoolSize')) {
    _.set(options, 'maxPoolSize', DEFAULT_POOL_SIZE);
  }
  return options;
}

function validateConnSettings(config: urlBuilder.MongoConfig): void {
  if (config.url) return;
  const { replicaset } = config;
  if (!replicaset) {
    if (!config.host) {
      throw new Error('`host` is required when `replicaset` is not set');
    }
  } else {
    if (!(typeof replicaset === 'object' && !Array.isArray(replicaset))) {
      throw new Error('`replicaset` is not an object');
    }
    if (!replicaset.name) {
      throw new Error('`replicaset.name` is not set');
    }
    if (!Array.isArray(replicaset.members)) {
      throw new Error('`replicaset.members` is not set or is not an array');
    }
    replicaset.members.forEach(m => {
      if (!m?.host) {
        throw new Error('each of `replicaset.members` must have `host` set');
      }
    });
  }
  if (!config.db) {
    throw new Error('`db` is not set');
  }
  if (config.password && !config.user) {
    throw new Error('`password` provided but `user` is not');
  }
  if (config.authDatabase && !config.user) {
    throw new Error('`authDatabase` provided but `user` is not');
  }
}

export function normalizeConfig(config: urlBuilder.MongoConfig): urlBuilder.MongoConfig {
  if (!(typeof config === 'object' && !Array.isArray(config))) {
    throw new Error('`config` is not provided or is not an object');
  }
  _.defaults(config, { collection: DEFAULT_COLLECTION });
  validateConnSettings(config);
  return config;
}

export function connect(config: urlBuilder.MongoConfig): Promise<MongoClient> {
  const options = _buildOptions(config);
  const url = urlBuilder.buildMongoConnString(config);
  return MongoClient.connect(url, options);
}

export function repeatString(str: string, n: number): string {
  return Array(n + 1).join(str);
}
