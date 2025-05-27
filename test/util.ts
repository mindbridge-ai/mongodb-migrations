import { describe, it, expect } from 'vitest';
import { _buildOptions, normalizeConfig } from '../src/utils';
import { MongoConfig } from '../src/types';

describe('Utils', () => {
  describe('_buildOptions', () => {
    it('should allow custom options and set the default `maxPoolSize` of 5', () => {
      const config = {
        options: {
          a: 1
        }
      };
      expect(_buildOptions(config)).toEqual({
        a: 1,
        maxPoolSize: 5
      });
    });

    it('should allow deeply nested options and set the default `maxPoolSize` of 5', () => {
      const config = {
        options: {
          a: { b: 'c' }
        }
      };
      expect(_buildOptions(config)).toEqual({
        a: { b: 'c' },
        maxPoolSize: 5
      });
    });

    it('should normalize null options and set the default `maxPoolSize` of 5', () => {
      const config = { otherKey: 'x' };
      expect(_buildOptions(config)).toEqual({ maxPoolSize: 5 });
    });

    it('should properly merge the `server` key and set the default `maxPoolSize` of 5', () => {
      const config = {
        options: {
          server: { x: 1 }
        }
      };
      expect(_buildOptions(config)).toEqual({
        maxPoolSize: 5,
        server: {
          x: 1
        }
      });
    });

    it('should not override the `maxPoolSize` if only set in `server`', () => {
      const config = {
        options: {
          server: {
            x: 1,
            maxPoolSize: 4
          }
        }
      };
      expect(_buildOptions(config)).toEqual({
        server: {
          maxPoolSize: 4,
          x: 1
        }
      });
    });

    it('[compat] should normalize null options and set the custom `maxPoolSize`', () => {
      const config = { otherKey: 'x', maxPoolSize: 7 };
      expect(_buildOptions(config)).toEqual({ maxPoolSize: 7 });
    });

    it('[compat] should support `maxPoolSize` with null options', () => {
      const config = { otherKey: 'x', maxPoolSize: 2 };
      expect(_buildOptions(config)).toEqual({ maxPoolSize: 2 });
    });

    it('[compat] should override the `maxPoolSize` if provided as a separate option', () => {
      const config = {
        options: {
          maxPoolSize: 2,
          server: {
            x: 1
          }
        },
        maxPoolSize: 4
      };
      expect(_buildOptions(config)).toEqual({
        maxPoolSize: 4,
        server: {
          x: 1
        }
      });
    });
  });

  describe('normalizeConfig', () => {
    it('should throw without config', () => {
      expect(() => normalizeConfig(undefined as unknown as MongoConfig)).toThrow('`config` is not provided or is not an object');
    });

    it('should allow config with proper url', () => {
      const config = {
        url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'
      };
      expect(normalizeConfig(config)).toEqual(config);
    });

    it('should set default collection', () => {
      const config = {
        url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'
      };
      expect(normalizeConfig(config).collection).toBe('_migrations');
    });

    it('should throw with wrong replicaset 1', () => {
      expect(() => normalizeConfig({
        replicaset: 7
      } as unknown as MongoConfig)).toThrow('`replicaset` is not an object');
    });

    it('should throw with wrong replicaset 2', () => {
      expect(() => normalizeConfig({
        replicaset: {}
      } as unknown as MongoConfig)).toThrow('`replicaset.name` is not set');
    });

    it('should throw with wrong replicaset 3', () => {
      expect(() => normalizeConfig({
        replicaset: {
          name: 'x'
        }
      } as unknown as MongoConfig)).toThrow('`replicaset.members` is not set or is not an array');
    });

    it('should throw with wrong replicaset 4', () => {
      expect(() => normalizeConfig({
        replicaset: {
          name: 'x',
          members: 'lol'
        }
      } as unknown as MongoConfig)).toThrow('`replicaset.members` is not set or is not an array');
    });

    it('should throw with wrong replicaset 5', () => {
      expect(() => normalizeConfig({
        replicaset: {
          name: 'x',
          members: [{ xost: 'x' }]
        }
      } as unknown as MongoConfig)).toThrow('each of `replicaset.members` must have `host` set');
    });

    it('should throw without host and replicaset', () => {
      expect(() => normalizeConfig({})).toThrow('`host` is required when `replicaset` is not set');
    });

    it('should throw without db', () => {
      expect(() => normalizeConfig({
        host: 'localhost'
      })).toThrow('`db` is not set');
    });

    it('should throw with password but without username', () => {
      expect(() => normalizeConfig({
        host: 'localhost',
        db: '_mm',
        password: 'very secret password'
      })).toThrow('`password` provided but `user` is not');
    });

    it('should throw with authDatabase but without username', () => {
      expect(() => normalizeConfig({
        host: 'localhost',
        db: '_mm',
        authDatabase: 'admin'
      })).toThrow('`authDatabase` provided but `user` is not');
    });
  });
});