import 'mocha';
import 'should';
import { Collection, Db } from 'mongodb';
import { Migrator } from '../src/mongodb-migrations';
import { beforeEach as commonBeforeEach } from './common';

describe('Migrations Collection', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;
  let migrationColl: Collection;

  beforeEach(async () => {
    const { migrator: m, db: database, config } = await commonBeforeEach();
    migrator = m;
    db = database;
    migrationColl = db.collection(config.collection!);
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should run migrations and only record them once', async () => {
    migrator.add({
      id: 'm1',
      up: async () => {
        await coll.insertOne({ name: 'tobi' });
      }
    });

    await migrator.migrate();
    let count = await coll.countDocuments({ name: 'tobi' });
    count.should.be.equal(1);

    count = await migrationColl.countDocuments({});
    count.should.be.equal(1);

    // run again
    await migrator.migrate();

    count = await coll.countDocuments({ name: 'tobi' });
    count.should.be.equal(1);

    count = await migrationColl.countDocuments({});
    // ensure that we didn't create the duplicate
    count.should.be.equal(1);
  });
});