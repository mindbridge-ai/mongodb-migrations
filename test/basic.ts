import 'mocha';
import 'should';
import { Collection, Db } from 'mongodb-legacy';
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

  it('should run migrations and return result', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: (cb) => {
        coll.insertOne({ name: 'tobi' }, cb);
      }
    });

    migrator.migrate((err, res) => {
      if (err) return done(err);
      (res as any).should.be.ok();
      (res!['1'] as any).should.be.ok();
      res!['1'].status.should.be.equal('ok');
      
      coll.countDocuments({ name: 'tobi' }).then((count) => {
        count.should.be.equal(1);
        done();
      }).catch(done);
    });
  });

  it('should run migrations that return resolved promise on error', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: () => {
        return new Promise<void>((resolve, reject) => {
          coll.insertOne({ name: 'tobi' }, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    });

    migrator.migrate((err, res) => {
      if (err) return done(err);
      (res as any).should.be.ok();
      (res!['1'] as any).should.be.ok();
      res!['1'].status.should.be.equal('ok');

      coll.countDocuments({ name: 'tobi' }).then((count) => {
        count.should.be.equal(1);
        done();
      }).catch(done);
    });
  });

  it('should run migrations and return rejected promise on error', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: () => {
        return Promise.reject(new Error('error - promise rejected'));
      }
    });

    migrator.migrate((err) => {
      if (!err) return done(new Error('migration should have failed'));
      err.message.should.be.equal('error - promise rejected');
      done();
    });
  });

  it('should timeout on promise-based migration and return error', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: () => {
        return new Promise((resolve) => setTimeout(resolve, 300));
      }
    });

    migrator.migrate((err) => {
      if (!err) return done(new Error('migration should have failed')); 
      err.message.should.be.equal('migration timed-out');
      done();
    });
  });

  it('should timeout migration and return error', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: (cb) => {
        setTimeout(cb, 300);
      }
    });

    migrator.migrate((err) => {
      if (!err) return done(new Error('migration should have failed'));
      err.message.should.be.equal('migration timed-out');
      done();
    });
  });

  it('should allow rollback', (done: Mocha.Done) => {
    migrator.add({
      id: "1",
      up: (cb) => {
        coll.insertOne({ name: 'tobi' }, cb);
      },
      down: (cb) => {
        coll.updateOne({ name: 'tobi' }, { $set: { name: 'loki' } }, cb);
      }
    });

    migrator.migrate((err) => {
      if (err) return done(err);
      migrator.rollback((err) => {
        if (err) return done(err);

        coll.countDocuments({ name: 'tobi' }).then((count) => {
          count.should.be.equal(0);
          return coll.countDocuments({ name: 'loki' });
        }).then((count) => {
          count.should.be.equal(1);
          done();
        }).catch(done);
      });
    });
  });

  it('should skip on consequent runs', (done: Mocha.Done) => {
    migrator.add({
      id: "1",
      up: (cb) => {
        coll.insertOne({ name: 'tobi' }, cb);
      },
      down: (cb) => {
        coll.updateOne({ name: 'tobi' }, { $set: { name: 'loki' } }, cb);
      }
    });

    migrator.migrate((err, res) => {
      if (err) return done(err);
      (res!['1'] as any).should.be.ok();
      res!['1'].status.should.be.equal('ok');

      migrator.migrate((err, res) => {
        if (err) return done(err);
        (res!['1'] as any).should.be.ok();
        res!['1'].status.should.be.equal('skip');
        done();
      });
    });
  });
});