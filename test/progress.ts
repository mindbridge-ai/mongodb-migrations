import 'mocha';
import 'should';
import { Migrator } from '../src/mongodb-migrations';
import { config } from './common';
import { LogLevel } from '../src/mongodb-migrations';

describe('Migrator Progress Reporting', () => {
  it('should call back the progress parameter', (done: Mocha.Done) => {
    const messages: string[] = [];
    const log = (level: LogLevel, message: string): void => {
      if (level === 'user') {
        messages.push(message);
      }
    };

    const migrator = new Migrator(config, log);

    migrator.add({
      id: '1',
      up: function(cb) {
        this.log('1');
        cb();
      }
    });

    migrator.add({
      id: '2',
      up: function(cb) {
        this.log('2');
        cb();
      }
    });

    let resultsCount = 0;

    migrator.migrate((err) => {
      if (err) return done(err);
    }, (migrationId, migrationRes) => {
      const status = migrationRes?.status;
      if (status !== 'ok') {
        const message = `Error running ${migrationId}, result is ${status}`;
        return done(new Error(message));
      }
      resultsCount += 1;
      if (resultsCount === 2) done();
    });
  });
});