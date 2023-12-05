mm = require '../src/mongodb-migrations'
testsCommon = require './common'

describe 'Migrations Collection', ->
  migrator = null
  db = null
  coll = null
  migrationColl = null

  beforeEach ->
    {migrator, db, config} = await testsCommon.beforeEach()
    migrationColl = db.collection(config.collection)
    coll = db.collection 'test'
    await coll.deleteMany {}

  it 'should run migrations and only record them once', (done) ->
    migrator.add
      id: 'm1'
      up: (cb) ->
        coll.insertOne name: 'tobi', cb
    migrator.migrate (err, res) ->
      return done(err) if err
      coll.find({name: 'tobi'}).count (err, count) ->
        return done(err) if err
        count.should.be.equal 1
        migrationColl.find({}).count (err, count) ->
          return done(err) if err
          count.should.be.equal 1

          # run again
          migrator.migrate (err, res) ->
            return done(err) if err
            coll.find({name: 'tobi'}).count (err, count) ->
              return done(err) if err
              count.should.be.equal 1
              migrationColl.find({}).count (err, count) ->
                return done(err) if err
                # ensure that we didn't create the duplicate
                count.should.be.equal 1
                done()
