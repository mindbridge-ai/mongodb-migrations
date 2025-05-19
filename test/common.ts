import { Migrator } from '../src/mongodb-migrations';
import { connect as mongoConnect } from '../lib/utils';
import { Db, MongoClient } from 'mongodb-legacy';
import { MongoConfig } from '../src/url-builder';

export const config: MongoConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: 27017,
  db: '_mm',
  collection: '_migrations',
  timeout: 200,
  // Ignore replicaset hostnames when running locally in a container
  options: {
    directConnection: true
  }
};

interface TestContext {
  migrator: Migrator;
  db: Db;
  config: MongoConfig;
}

export async function beforeEach(): Promise<TestContext> {
  const client: MongoClient = await mongoConnect(config);
  const db: Db = client.db();
  await db.collection(config.collection!).deleteMany({});
  const migrator = new Migrator(config, null);
  return { migrator, db, config };
}
