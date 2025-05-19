import 'mocha';
import 'should';
import path from 'path';
import { Collection, Db } from 'mongodb-legacy';
import { Migrator } from '../src/mongodb-migrations';
import testsCommon from './common';

describe('Migrator Rollback', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;

  beforeEach(async () => {
    ({ migrator, db } = await testsCommon.beforeEach());
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should cleanup the migrations collection properly', (done: Mocha.Done) => {
    const dir = path.join(__dirname, 'migrations');
    const migrationsCol = db.collection('_migrations');
    migrator.runFromDir(dir, (err) => {
      if (err) return done(err);
      migrationsCol.find().count((err, count) => {
        if (err) return done(err);
        count!.should.be.equal(3);
        
        migrator.rollback((err) => {
          if (err) return done(err);
          coll.find().count((err, count) => {
            if (err) return done(err);
            count!.should.be.equal(0);

            migrationsCol.find().count((err, count) => {
              if (err) return done(err);
              count!.should.be.equal(0);
              done();
            });
          });
        });
      });
    });
  });
});