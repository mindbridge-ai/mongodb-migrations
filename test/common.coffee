mm = require '../src/mongodb-migrations'
mongoConnect = require('../src/utils').connect

config =
  host: process.env.DB_HOST || 'localhost'
  port: 27017
  db: '_mm'
  collection: '_migrations'
  timeout: 200
  # Ignore replicaset hostnames when running locally in a container
  options:
    directConnection: true

module.exports =
  config: config

  beforeEach: ->
    client = await mongoConnect config
    db = client.db()
    await db.collection(config.collection).deleteMany {}
    migrator = new mm.Migrator config, null
    return { migrator, db, config }
