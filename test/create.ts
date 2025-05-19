import 'mocha';
import 'should';
import path from 'path';
import fs from 'fs';
import { rimraf } from 'rimraf';
import { Migrator } from '../src/mongodb-migrations';
import { beforeEach as commonBeforeEach } from './common';

describe('Migrations Builder', () => {
  let migrator: Migrator;
  const dir = path.join(__dirname, 'created-migrations');

  beforeEach(async () => {
    ({ migrator } = await commonBeforeEach());
    await rimraf(dir);
  });

  it('should create migration stubs for JS', (done: Mocha.Done) => {
    migrator.create(dir, 'test1', (err) => {
      if (err) return done(err);
      fs.existsSync(path.join(dir, '1-test1.js')).should.be.ok();
      
      migrator.create(dir, 'test2', (err) => {
        if (err) return done(err);
        fs.existsSync(path.join(dir, '2-test2.js')).should.be.ok();
        done();
      });
    });
  });

  it('should create migration stubs for Coffee', (done: Mocha.Done) => {
    migrator.create(dir, 'test1', (err) => {
      if (err) return done(err);
      fs.existsSync(path.join(dir, '1-test1.coffee')).should.be.ok();
      done();
    }, true);
  });
});