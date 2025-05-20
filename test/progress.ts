import 'mocha';
import 'should';
import { Migrator } from '../src/mongodb-migrations';
import { config } from './common';
import { LogLevel } from '../src/mongodb-migrations';

describe('Migrator Progress Reporting', () => {
  it('should call back the progress parameter', async () => {
    const messages: string[] = [];
    const log = (level: LogLevel, message: string): void => {
      if (level === 'user') {
        messages.push(message);
      }
    };

    const migrator = new Migrator(config, log);
    const progressResults: string[] = [];

    migrator.add({
      id: '1',
      up: async function() {
        this.log('1');
      }
    });

    migrator.add({
      id: '2',
      up: async function() {
        this.log('2');
      }
    });

    await new Promise<void>((resolve, reject) => {
      let resultsCount = 0;
      migrator.migrate((migrationId, migrationRes) => {
        const status = migrationRes?.status;
        if (status !== 'ok') {
          reject(new Error(`Error running ${migrationId}, result is ${status}`));
          return;
        }
        progressResults.push(migrationId);
        resultsCount += 1;
        if (resultsCount === 2) resolve();
      }).catch(reject);
    });

    messages.should.have.lengthOf(2);
    progressResults.should.have.lengthOf(2);
  });
});