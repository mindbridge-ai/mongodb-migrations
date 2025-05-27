import 'mocha';
import 'should';
import path from 'path';
import { Migrator } from '../src/mongodb-migrations';
import { config } from './common';

describe('Migrator Dispose', () => {
  it('should be disposable', async () => {
    const migrator = new Migrator(config, null);
    const dir = path.join(__dirname, 'migrations');
    
    await new Promise<void>((resolve, reject) => {
      migrator.runFromDir(dir, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await migrator.dispose();
    
    // After disposing, any operations should fail
    try {
      await new Promise<void>((resolve, reject) => {
        migrator.rollback((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      throw new Error('Expected rollback to fail after dispose');
    } catch (err) {
      String(err).should.match(/disposed/);
    }
  });
});