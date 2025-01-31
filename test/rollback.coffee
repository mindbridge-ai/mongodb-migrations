path = require 'path'
mm = require '../src/mongodb-migrations'
testsCommon = require './common'

describe 'Migrator Rollback', ->
  migrator = null
  db = null
  coll = null

  beforeEach ->
    {migrator, db} = await testsCommon.beforeEach()
    coll = db.collection 'test'
    await coll.deleteMany {}

  it 'should cleanup the migrations collection properly', (done) ->
    dir = path.join __dirname, 'migrations'
    migrationsCol = db.collection '_migrations'
    migrator.runFromDir dir, (err, res) ->
      return done(err) if err
      migrationsCol.find().count (err, count) ->
        return done(err) if err
        count.should.be.equal 4
        migrator.rollback (err, res) ->
          return done(err) if err
          coll.find().count (err, count) ->
            return done(err) if err
            count.should.be.equal 0

            migrationsCol.find().count (err, count) ->
              return done(err) if err
              count.should.be.equal 0
              done()
    return undefined
