import 'mocha';
import 'should';
import { Collection, Db } from 'mongodb-legacy';
import { Migrator } from '../src/mongodb-migrations';
import testsCommon from './common';

describe('Migrations Collection', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;
  let migrationColl: Collection;

  beforeEach(async () => {
    const { migrator: m, db: database, config } = await testsCommon.beforeEach();
    migrator = m;
    db = database;
    migrationColl = db.collection(config.collection!);
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should run migrations and only record them once', (done: Mocha.Done) => {
    migrator.add({
      id: 'm1',
      up: (cb) => {
        coll.insertOne({ name: 'tobi' }, cb);
      }
    });

    migrator.migrate((err) => {
      if (err) return done(err);
      coll.find({ name: 'tobi' }).count((err, count) => {
        if (err) return done(err);
        count!.should.be.equal(1);

        migrationColl.find({}).count((err, count) => {
          if (err) return done(err);
          count!.should.be.equal(1);

          // run again
          migrator.migrate((err) => {
            if (err) return done(err);
            coll.find({ name: 'tobi' }).count((err, count) => {
              if (err) return done(err);
              count!.should.be.equal(1);

              migrationColl.find({}).count((err, count) => {
                if (err) return done(err);
                // ensure that we didn't create the duplicate
                count!.should.be.equal(1);
                done();
              });
            });
          });
        });
      });
    });
  });
});