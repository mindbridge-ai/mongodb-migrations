import 'mocha';
import 'should';
import { Collection, Db } from 'mongodb';
import { Migrator } from '../src/mongodb-migrations';
import { beforeEach as commonBeforeEach } from './common';

describe('Migrator', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;

  beforeEach(async () => {
    ({ migrator, db } = await commonBeforeEach());
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should exist', (done: Mocha.Done) => {
    (migrator as any).should.be.ok();
    (db as any).should.be.ok();
    done();
  });

  it('should set default migrations collection', (done: Mocha.Done) => {
    const config1 = {
      host: 'localhost',
      port: 27017,
      db: '_mm'
    };
    const m1 = new Migrator(config1, null);
    (m1 as any)._collName.should.be.equal('_migrations');

    const config2 = {
      host: 'localhost',
      port: 27017,
      db: '_mm',
      collection: '_custom'
    };
    const m2 = new Migrator(config2, null);
    (m2 as any)._collName.should.be.equal('_custom');
    done();
  });

  it('should run migrations and return result', async () => {
    migrator.add({
      id: '1',
      up: async () => {
        await coll.insertOne({ name: 'tobi' });
      }
    });

    const res = await migrator.migrate();
    (res as any).should.be.ok();
    (res['1'] as any).should.be.ok();
    res['1'].status.should.be.equal('ok');
    
    const count = await coll.countDocuments({ name: 'tobi' });
    count.should.be.equal(1);
  });

  it('should run migrations and return error on promise rejection', async () => {
    migrator.add({
      id: '1',
      up: async () => {
        throw new Error('error - promise rejected');
      }
    });

    try {
      await migrator.migrate();
      throw new Error('migration should have failed');
    } catch (err) {
      if (err instanceof Error) {
        err.message.should.be.equal('error - promise rejected');
      } else {
        throw new Error('Expected err to be an Error instance');
      }
    }
  });

  it('should timeout on promise-based migration and return error', async () => {
    migrator.add({
      id: '1',
      up: async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    });

    try {
      await migrator.migrate();
      throw new Error("migration should have failed with a timeout before getting here");
    } catch (err) {
      String(err).should.endWith("timed-out");
    }
  });

  it('should allow rollback', async () => {
    migrator.add({
      id: "1",
      up: async () => {
        await coll.insertOne({ name: 'tobi' });
      },
      down: async () => {
        await coll.updateOne({ name: 'tobi' }, { $set: { name: 'loki' } });
      }
    });

    await migrator.migrate();
    await migrator.rollback();

    let count = await coll.countDocuments({ name: 'tobi' });
    count.should.be.equal(0);
    
    count = await coll.countDocuments({ name: 'loki' });
    count.should.be.equal(1);
  });

  it('should skip on consequent runs', async () => {
    migrator.add({
      id: "1",
      up: async () => {
        await coll.insertOne({ name: 'tobi' });
      },
      down: async () => {
        await coll.updateOne({ name: 'tobi' }, { $set: { name: 'loki' } });
      }
    });

    let res = await migrator.migrate();
    (res['1'] as any).should.be.ok();
    res['1'].status.should.be.equal('ok');

    res = await migrator.migrate();
    (res['1'] as any).should.be.ok();
    res['1'].status.should.be.equal('skip');
  });
});