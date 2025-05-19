import 'mocha';
import 'should';
import { Collection, Db } from 'mongodb-legacy';
import { Migrator } from '../src/mongodb-migrations';
import { beforeEach as commonBeforeEach } from './common';

describe('Migrator Errors Handling', () => {
  let migrator: Migrator;
  let db: Db;
  let coll: Collection;

  beforeEach(async () => {
    ({ migrator, db } = await commonBeforeEach());
    coll = db.collection('test');
    await coll.deleteMany({});
  });

  it('should run migrations and stop on the first error', (done: Mocha.Done) => {
    migrator.add({
      id: '1',
      up: (cb) => {
        cb();
      }
    });

    migrator.add({
      id: '2',
      up: (cb) => {
        cb();
      }
    });

    migrator.add({
      id: '3',
      up: (cb) => {
        cb(new Error('Some error'));
      }
    });

    migrator.add({
      id: '4',
      up: (cb) => {
        cb();
      }
    });

    migrator.migrate((err, res) => {
      err!.toString().should.endWith('Some error');
      (res as any).should.be.ok();

      (res!['1'] as any).should.be.ok();
      res!['1'].status.should.be.equal('ok');

      (res!['2'] as any).should.be.ok();
      res!['2'].status.should.be.equal('ok');

      (res!['3'] as any).should.be.ok();
      res!['3'].status.should.be.equal('error');
      res!['3'].error!.toString().should.endWith('Some error');

      (!res!['4']).should.be.ok();

      done();
    });
  });
});