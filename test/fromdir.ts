import 'mocha';
import 'should';
import path from 'path';
import { Collection, Db } from 'mongodb-legacy';
import { Migrator } from '../src/mongodb-migrations';
import testsCommon from './common';

describe('Migrator from Directory', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;

  beforeEach(async () => {
    ({ migrator, db } = await testsCommon.beforeEach());
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should run migrations from directory', (done: Mocha.Done) => {
    const dir = path.join(__dirname, 'migrations');
    migrator.runFromDir(dir, (err, res) => {
      if (err) return done(err);
      
      coll.find({ name: 'tobi' }).count((err, count) => {
        if (err) return done(err);
        count!.should.be.equal(1);

        coll.find({ name: 'loki' }).count((err, count) => {
          if (err) return done(err);
          count!.should.be.equal(1);

          coll.find({ ok: 1 }).count((err, count) => {
            if (err) return done(err);
            count!.should.be.equal(2);

            migrator.rollback((err) => {
              if (err) return done(err);
              coll.find().count((err, count) => {
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
});