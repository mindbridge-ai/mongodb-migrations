import 'mocha';
import 'should';
import { Migrator } from '../src/mongodb-migrations';
import { config } from './common';

describe('Migrator Logging', () => {
  it('should allow custom logging', async () => {
    const messages: string[] = [];
    const log = (level: string, message: string): void => {
      if (level === 'user') {
        messages.push(message);
      }
    };

    const migrator = new Migrator(config, log);

    migrator.add({
      id: '1',
      up: async function() {
        this.log('1');
        this.log('2');
      }
    });

    const res = await migrator.migrate();
    (res['1'] as any).should.be.ok();
    messages.should.have.lengthOf(2);
    messages[0].should.be.equal('1');
    messages[1].should.be.equal('2');
  });
});