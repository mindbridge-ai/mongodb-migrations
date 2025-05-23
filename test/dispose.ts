import { describe, it, expect } from 'vitest';
import path from 'path';
import { Migrator } from '../src/mongodb-migrations';
import { config } from './common';

describe('Migrator Dispose', () => {
  it('should be disposable', async () => {
    const migrator = new Migrator(config, null);
    const dir = path.join(__dirname, 'migrations');
    
    await migrator.runFromDir(dir);
    
    await migrator.dispose();

    // After disposing, any operations should fail
    try {
      await migrator.rollback();
      throw new Error('Expected rollback to fail after dispose');
    } catch (err) {
      expect(String(err)).toMatch(/disposed/);
    }
  });
});