fs = require 'fs'
path = require 'path'
Promise = require 'bluebird'
_ = require 'lodash'
mkdirp = require 'mkdirp'
{ repeatString, connect: mongoConnect, normalizeConfig } = require('./utils')
migrationStub = require('./migration-stub')


defaultLog = (src, args...) ->
  pad = repeatString(' ', if src is 'system' then 4 else 2)
  console.log(pad, args...)

class Migrator
  constructor: (dbConfig, logFn) ->
    # this will throw in case of invalid values
    dbConfig = normalizeConfig(dbConfig)

    @_isDisposed = false
    @_m = []
    @_result = {}

    @_dbReady = new Promise.fromCallback (cb) ->
      mongoConnect dbConfig, cb
    .then (client) =>
      @_client = client
      @_db = client.db()

    @_collName = dbConfig.collection
    @_timeout = dbConfig.timeout

    if logFn or logFn is null
      @log = logFn
    else
      @log = defaultLog

  add: (m) ->
    # m must be an { id, up, down } object
    @_m.push m

  bulkAdd: (array) ->
    # array must be an Array of { id, up, down } objects
    @_m = @_m.concat array

  _coll: ->
    @_db.collection(@_collName)

  _runWhenReady: (direction, cb, progress) ->
    if @_isDisposed
      return cb new Error 'This migrator is disposed and cannot be used anymore'
    onSuccess = =>
      @_ranMigrations = {}
      @_coll().find().toArray (err, docs) =>
        if err
          return cb err
        for doc in docs
          @_ranMigrations[doc.id] = true
        @_run direction, cb, progress
    onError = (err) ->
      cb err
    @_dbReady.then onSuccess, onError

  _run: (direction, done, progress) ->
    if direction == 'down'
      m = _(@_m)
        .reverse()
        .filter (m) => (_r = @_result[m.id]?.status) and _r != 'skip'
        .value()
    else
      direction = 'up'
      @_result = {}
      m = @_m
    @_lastDirection = direction

    logFn = @log
    log = (src) ->
      (msg) ->
        logFn?(src, msg)
    userLog = log('user')
    systemLog = log('system')

    i = 0
    l = m.length
    migrationsCollection = @_coll()

    migrationsCollectionUpdatePromises = []

    handleMigrationDone = (id) ->
      p = if direction == 'up'
        Promise.fromCallback (cb) ->
          migrationsCollection.insertOne { id }, cb
      else
        Promise.fromCallback (cb) ->
          migrationsCollection.deleteMany { id }, cb

      migrationsCollectionUpdatePromises.push(p)

    allDone = (err) =>
      Promise.all(migrationsCollectionUpdatePromises).then =>
        done err, @_result
      # This return is necessary to prevent the above promise from being returned,
      # otherwise the promise will eventually be returned by the migration up/down function.
      # That would interfere with promise-based migrations, so explicitly return nothing here.
      return

    runOne = =>
      if i >= l
        return allDone()
      migration = m[i]
      i += 1

      migrationDone = (res) =>
        @_result[migration.id] = res
        _.defer ->
          progress?(migration.id, res)
        msg = "Migration '#{migration.id}': #{res.status}"
        if res.status is 'skip'
          msg += " (#{res.reason})"
        systemLog msg
        if res.status is 'error'
          systemLog '  ' + res.error
        if res.status is 'ok' or (res.status is 'skip' and res.code in ['no_up', 'no_down'])
          handleMigrationDone(migration.id)

      fn = migration[direction]
      id = migration.id

      skipReason = null
      skipCode = null
      if not fn
        skipReason = "no migration function for direction #{direction}"
        skipCode = "no_#{direction}"
      if direction == 'up' and id of @_ranMigrations
        skipReason = "migration already ran"
        skipCode = 'already_ran'
      if direction == 'down' and id not of @_result
        skipReason = "migration wasn't in the recent `migrate` run"
        skipCode = 'not_in_recent_migrate'
      if skipReason
        migrationDone status: 'skip', reason: skipReason, code: skipCode
        return runOne()

      didTimeout = false
      didReturnPromise = false
      didExecuteCallback = false

      promiseAndDoneError = () ->
        err = new Error "Migration called done() AND returned a promise"
        migrationDone status: 'error', error: err
        allDone(err)

      if @_timeout
        timeoutId = setTimeout () ->
          didTimeout = true
          err = new Error "migration timed-out"
          migrationDone status: 'error', error: err
          allDone(err)
        , @_timeout

      context = { db: @_db, log: userLog, client: @_client }

      donePromise = fn.call context, (err) ->
        didExecuteCallback = true;

        return if didTimeout
        clearTimeout timeoutId

        if didReturnPromise
          promiseAndDoneError()
          return

        if err
          migrationDone status: 'error', error: err
          allDone(err)
        else
          migrationDone status: 'ok'
          runOne()

      if donePromise && donePromise.then instanceof Function
        didReturnPromise = true;

        if didExecuteCallback
          promiseAndDoneError()
          return

        donePromise.then(() ->
          return if didTimeout
          clearTimeout timeoutId
          migrationDone status: 'ok'
          runOne()
        ).catch((err) ->
          return if didTimeout
          clearTimeout timeoutId
          migrationDone status: 'error', error: err
          allDone(err)
        );

    runOne()

  migrate: (done, progress) ->
    @_runWhenReady 'up', done, progress
    return

  rollback: (done, progress) ->
    if @_lastDirection != 'up'
      return done new Error('Rollback can only be ran after migrate')
    @_runWhenReady 'down', done, progress
    return

  _loadMigrationFiles: (dir, cb) ->
    mkdirp(dir, { mode: 0o0774 }).then((err) ->
      fs.readdir dir, (err, files) ->
        if err
          return cb err
        files = files
          .filter (f) ->
            path.extname(f) in ['.js', '.coffee'] and not f.startsWith('.')
          .map (f) ->
            n = f.match(/^(\d+)/)?[1]
            if n
              n = parseInt n, 10
            else
              n = null
            return  { number: n, name: f }
          .filter (f) -> !!f.name
          .sort (f1, f2) -> f1.number - f2.number
          .map (f) ->
            fileName = path.join dir, f.name
            if fileName.match /\.coffee$/
              require('coffeescript/register')
            return { number: f.number, module: require(fileName) }
        cb null, files
    , cb)

  runFromDir: (dir, done, progress) ->
    @_loadMigrationFiles dir, (err, files) =>
      if err
        return done err
      @bulkAdd _.map(files, 'module')
      @migrate done, progress

  create: (dir, id, done, coffeeScript=false) ->
    @_loadMigrationFiles dir, (err, files) ->
      if err
        return done err
      maxNum = _.maxBy(files, 'number')?.number ? 0
      nextNum = maxNum + 1
      slug = (id or '').toLowerCase().replace /\s+/, '-'
      ext = if coffeeScript then 'coffee' else 'js'
      fileName = path.join dir, "#{nextNum}-#{slug}.#{ext}"
      body = migrationStub(id, coffeeScript)
      fs.writeFile fileName, body, done

  dispose: (cb) ->
    @_isDisposed = true
    onSuccess = =>
      try
        @_client.close()
        cb?(null)
      catch e
        cb?(e)
    @_dbReady.then onSuccess, cb

module.exports.Migrator = Migrator
