mm = require '../src/mongodb-migrations'
testsCommon = require './common'

describe 'Migrator', ->
  migrator = null
  db = null
  coll = null

  beforeEach ->
    {migrator, db} = await testsCommon.beforeEach()
    coll = db.collection 'test'
    await coll.deleteMany {}

  it 'should exist', (done) ->
    migrator.should.be.ok()
    db.should.be.ok()
    done()

  it 'should set default migrations collection', (done) ->
    config1 =
      host: 'localhost'
      port: 27017
      db: '_mm'
    m1 = new mm.Migrator config1, null
    m1._collName.should.be.equal('_migrations')
    config2 =
      host: 'localhost'
      port: 27017
      db: '_mm'
      collection: '_custom'
    m2 = new mm.Migrator config2, null
    m2._collName.should.be.equal('_custom')
    done()

  it 'should run migrations and return result', (done) ->
    migrator.add
      id: '1'
      up: (cb) ->
        coll.insertOne name: 'tobi', cb
    migrator.migrate (err, res) ->
      return done(err) if err
      res.should.be.ok()
      res['1'].should.be.ok()
      res['1'].status.should.be.equal 'ok'
      coll.find({name: 'tobi'}).count (err, count) ->
        return done(err) if err
        count.should.be.equal 1
        done()

  it 'should run migrations that return resolved promise on error', (done) ->
    migrator.add
      id: '1'
      up: () ->
        return new Promise((resolve, reject) =>
          coll.insertOne name: 'tobi', (err) ->
            if err
              reject(err)
            else
              resolve()
        );

    migrator.migrate (err, res) ->
      return done(err) if err
      res.should.be.ok()
      res['1'].should.be.ok()
      res['1'].status.should.be.equal 'ok'
      coll.find({name: 'tobi'}).count (err, count) ->
        return done(err) if err
        count.should.be.equal 1
        done()

  it 'should run migrations and return rejected promise on error', (done) ->
    migrator.add
      id: '1'
      up: () ->
        return Promise.reject(new Error('error - promise rejected'))

    migrator.migrate (err, res) ->
      return done(new Error 'migration should have failed') if not err
      err.message.should.be.equal 'error - promise rejected'
      done()

  it 'should timeout on promise-based migration and return error', (done) ->
    migrator.add
      id: '1'
      up: () ->
        return new Promise((resolve, reject) => setTimeout resolve, 300)
    migrator.migrate (err) ->
      return done(new Error 'migration should have failed') if not err
      err.message.should.be.equal 'migration timed-out'
      done()

  it 'should timeout migration and return error', (done) ->
    migrator.add
      id: '1'
      up: (cb) ->
        setTimeout cb, 300
    migrator.migrate (err) ->
      return done(new Error 'migration should have failed') if not err
      err.message.should.be.equal 'migration timed-out'
      done()

  it 'should allow rollback', (done) ->
    migrator.add
      id: 1
      up: (cb) ->
        coll.insertOne name: 'tobi', cb
        return
      down: (cb) ->
        coll.updateOne { name: 'tobi' }, { $set: { name: 'loki' } }, cb
        return
    migrator.migrate (err, res) ->
      return done(err) if err
      migrator.rollback (err, res) ->
        return done(err) if err
        coll.find({name: 'tobi'}).count (err, count) ->
          return done(err) if err
          count.should.be.equal 0
          coll.find({name: 'loki'}).count (err, count) ->
            return done(err) if err
            count.should.be.equal 1
            done()

  it 'should skip on consequent runs', (done) ->
    migrator.add
      id: 1
      up: (cb) ->
        coll.insertOne name: 'tobi', cb
      down: (cb) ->
        coll.updateOne { name: 'tobi' }, { $set: { name: 'loki' } }, cb
    migrator.migrate (err, res) ->
      return done(err) if err
      res['1'].should.be.ok()
      res['1'].status.should.be.equal 'ok'
      migrator.migrate (err, res) ->
        return done(err) if err
        res['1'].should.be.ok()
        res['1'].status.should.be.equal 'skip'
        done()
