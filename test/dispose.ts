import 'mocha';
import 'should';
import path from 'path';
import { Migrator } from '../src/mongodb-migrations';
import testsCommon from './common';

describe('Migrator Dispose', () => {
  it('should be disposable', (done: Mocha.Done) => {
    const migrator = new Migrator(testsCommon.config, null);
    const dir = path.join(__dirname, 'migrations');
    migrator.runFromDir(dir, (err) => {
      if (err) return done(err);
      migrator.dispose((err) => {
        if (err) return done(err);
        migrator.rollback((err) => {
          String(err).should.match(/disposed/);
          done();
        });
      });
    });
  });
});