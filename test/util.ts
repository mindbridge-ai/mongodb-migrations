import 'mocha';
import { _buildOptions, normalizeConfig } from '../src/utils';
import should from 'should';
import { MongoConfig } from '../src/types';

describe('Utils', () => {
  describe('_buildOptions', () => {
    it('should allow custom options and set the default `maxPoolSize` of 5', (done: Mocha.Done) => {
      const config = {
        options: {
          a: 1
        }
      };
      _buildOptions(config).should.be.deepEqual({
        a: 1,
        maxPoolSize: 5
      });
      done();
    });

    it('should allow deeply nested options and set the default `maxPoolSize` of 5', (done: Mocha.Done) => {
      const config = {
        options: {
          a: { b: 'c' }
        }
      };
      _buildOptions(config).should.be.deepEqual({
        a: { b: 'c' },
        maxPoolSize: 5
      });
      done();
    });

    it('should normalize null options and set the default `maxPoolSize` of 5', (done: Mocha.Done) => {
      const config = { otherKey: 'x' };
      _buildOptions(config).should.be.deepEqual({ maxPoolSize: 5 });
      done();
    });

    it('should properly merge the `server` key and set the default `maxPoolSize` of 5', (done: Mocha.Done) => {
      const config = {
        options: {
          server: { x: 1 }
        }
      };
      _buildOptions(config).should.be.deepEqual({
        maxPoolSize: 5,
        server: {
          x: 1
        }
      });
      done();
    });

    it('should not override the `maxPoolSize` if only set in `server`', (done: Mocha.Done) => {
      const config = {
        options: {
          server: {
            x: 1,
            maxPoolSize: 4
          }
        }
      };
      _buildOptions(config).should.be.deepEqual({
        server: {
          maxPoolSize: 4,
          x: 1
        }
      });
      done();
    });

    it('[compat] should normalize null options and set the custom `maxPoolSize`', (done: Mocha.Done) => {
      const config = { otherKey: 'x', maxPoolSize: 7 };
      _buildOptions(config).should.be.deepEqual({ maxPoolSize: 7 });
      done();
    });

    it('[compat] should support `maxPoolSize` with null options', (done: Mocha.Done) => {
      const config = { otherKey: 'x', maxPoolSize: 2 };
      _buildOptions(config).should.be.deepEqual({ maxPoolSize: 2 });
      done();
    });

    it('[compat] should override the `maxPoolSize` if provided as a separate option', (done: Mocha.Done) => {
      const config = {
        options: {
          maxPoolSize: 2,
          server: {
            x: 1
          }
        },
        maxPoolSize: 4
      };
      _buildOptions(config).should.be.deepEqual({
        maxPoolSize: 4,
        server: {
          x: 1
        }
      });
      done();
    });
  });

  describe('normalizeConfig', () => {
    it('should throw without config', (done: Mocha.Done) => {
      normalizeConfig.should.throw('`config` is not provided or is not an object');
      done();
    });

    it('should allow config with proper url', (done: Mocha.Done) => {
      const config = {
        url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'
      };
      normalizeConfig(config).should.be.deepEqual(config);
      done();
    });

    it('should set default collection', (done: Mocha.Done) => {
      const config = {
        url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'
      };
      should(normalizeConfig(config).collection).be.equal('_migrations');
      done();
    });

    it('should throw with wrong replicaset 1', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        replicaset: 7
      } as unknown as MongoConfig).should.throw('`replicaset` is not an object');
      done();
    });

    it('should throw with wrong replicaset 2', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        replicaset: {}
      } as unknown as MongoConfig).should.throw('`replicaset.name` is not set');
      done();
    });

    it('should throw with wrong replicaset 3', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        replicaset: {
          name: 'x'
        }
      } as unknown as MongoConfig).should.throw('`replicaset.members` is not set or is not an array');
      done();
    });

    it('should throw with wrong replicaset 4', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        replicaset: {
          name: 'x',
          members: 'lol'
        }
      } as unknown as MongoConfig).should.throw('`replicaset.members` is not set or is not an array');
      done();
    });

    it('should throw with wrong replicaset 5', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        replicaset: {
          name: 'x',
          members: [{ xost: 'x' }]
        }
      } as unknown as MongoConfig).should.throw('each of `replicaset.members` must have `host` set');
      done();
    });

    it('should throw without host and replicaset', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
      }).should.throw('`host` is required when `replicaset` is not set');
      done();
    });

    it('should throw without db', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        host: 'localhost'
      }).should.throw('`db` is not set');
      done();
    });

    it('should throw with password but without username', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        host: 'localhost',
        db: '_mm',
        password: 'very secret password'
      }).should.throw('`password` provided but `user` is not');
      done();
    });

    it('should throw with authDatabase but without username', (done: Mocha.Done) => {
      normalizeConfig.bind(null, {
        host: 'localhost',
        db: '_mm',
        authDatabase: 'admin'
      }).should.throw('`authDatabase` provided but `user` is not');
      done();
    });
  });
});