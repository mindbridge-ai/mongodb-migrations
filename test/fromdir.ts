import 'mocha';
import 'should';
import path from 'path';
import { Collection, Db } from 'mongodb';
import { Migrator } from '../src/mongodb-migrations';
import { beforeEach as commonBeforeEach } from './common';

describe('Migrator from Directory', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;

  beforeEach(async () => {
    ({ migrator, db } = await commonBeforeEach());
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should run migrations from directory', async () => {
    const dir = path.join(__dirname, 'migrations');
    const res = await migrator.runFromDir(dir);
    
    let count = await coll.countDocuments({ name: 'tobi' });
    count.should.be.equal(1);

    count = await coll.countDocuments({ name: 'loki' });
    count.should.be.equal(1);

    count = await coll.countDocuments({ ok: 1 });
    count.should.be.equal(2);

    await migrator.rollback();
    count = await coll.countDocuments();
    count.should.be.equal(0);
  });
});