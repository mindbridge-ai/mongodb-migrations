import { describe, it, expect } from 'vitest';
import * as urlBuilder from '../lib/url-builder';

describe('Url Builder', () => {
  it('uses the url as given', () => {
    const config = {
      url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true',
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(config.url);
  });

  it('builds a single node url', () => {
    const config = {
      user: 'someuser',
      password: 'somepass',
      host: 'abcde',
      port: 27111,
      db: '_mm',
      collection: '_migrations',
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(`mongodb://${config.user}:${config.password}@${config.host}:${config.port}/${config.db}`);
  });

  it('builds a single node url with ssl', () => {
    const config = {
      user: 'someuser',
      password: 'somepass',
      host: 'abcde',
      port: 27111,
      db: '_mm',
      collection: '_migrations',
      ssl: true,
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(`mongodb://${config.user}:${config.password}@${config.host}:${config.port}/${config.db}?ssl=true`);
  });

  it('builds a single node url with an authDatabase', () => {
    const config = {
      user: 'someuser',
      password: 'somepass',
      host: 'abcde',
      port: 27111,
      db: '_mm',
      collection: '_migrations',
      authDatabase: 'admin',
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(`mongodb://${config.user}:${config.password}@${config.host}:${config.port}/${config.db}?authSource=${config.authDatabase}`);
  });

  it('builds a replicaset url with two replicas', () => {
    const config = {
      user: 'someuser',
      password: 'somepass',
      replicaset: {
        name: 'rs-ds023680',
        members: [
          { host: 'bee.boo.bar', port: 23680 },
          { host: 'choo.choo', port: 24610 },
        ],
      },
      db: '_mm',
      collection: '_migrations',
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(
      `mongodb://${config.user}:${config.password}@` +
      `${config.replicaset.members[0].host}:${config.replicaset.members[0].port},` +
      `${config.replicaset.members[1].host}:${config.replicaset.members[1].port}/` +
      `${config.db}?replicaSet=${config.replicaset.name}`
    );
  });

  it('builds a replicaset url with three replicas', () => {
    const config = {
      user: 'someuser',
      password: 'somepass',
      replicaset: {
        name: 'rs-ds023680',
        members: [
          { host: 'bee.boo.bar', port: 23680 },
          { host: 'choo.choo', port: 24610 },
          { host: 'aaa.bbb.ccc', port: 22718 },
        ],
      },
      db: '_mm',
      collection: '_migrations',
    };
    const connString = urlBuilder.buildMongoConnString(config);
    expect(connString).toBe(
      `mongodb://${config.user}:${config.password}@` +
      `${config.replicaset.members[0].host}:${config.replicaset.members[0].port},` +
      `${config.replicaset.members[1].host}:${config.replicaset.members[1].port},` +
      `${config.replicaset.members[2].host}:${config.replicaset.members[2].port}/` +
      `${config.db}?replicaSet=${config.replicaset.name}`
    );
  });
});
