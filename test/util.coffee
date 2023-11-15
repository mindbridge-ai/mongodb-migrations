{ _buildOptions, normalizeConfig } = require '../src/utils'

describe 'Utils', ->

    describe '_buildOptions', ->

        it 'should allow custom options and set the default `maxPoolSize` of 5', (done) ->
            config =
                options:
                    a: 1
            _buildOptions(config).should.be.deepEqual({
                a: 1
                maxPoolSize: 5
            })
            done()

        it 'should allow deeply nested options and set the default `maxPoolSize` of 5', (done) ->
            config =
                options:
                    a: b: 'c'
            _buildOptions(config).should.be.deepEqual({
                a: b: 'c'
                maxPoolSize: 5
            })
            done()

        it 'should normalize null options and set the default `maxPoolSize` of 5', (done) ->
            config = { otherKey: 'x' }
            _buildOptions(config).should.be.deepEqual({ maxPoolSize: 5 })
            done()

        # xxx remove
        it 'should properly merge the `server` key and set the default `maxPoolSize` of 5', (done) ->
            config =
                options:
                    server: x: 1
            _buildOptions(config).should.be.deepEqual({
                maxPoolSize: 5
                server:
                    x: 1
            })
            done()

        it 'should not override the `maxPoolSize` if only set in `server`', (done) ->
            config =
                options:
                    server:
                        x: 1
                        maxPoolSize: 4
            _buildOptions(config).should.be.deepEqual({
                server:
                    maxPoolSize: 4
                    x: 1
            })
            done()

        it '[compat] should normalize null options and set the custom `maxPoolSize`', (done) ->
            config = { otherKey: 'x', maxPoolSize: 7 }
            _buildOptions(config).should.be.deepEqual({ maxPoolSize: 7 })
            done()

        it '[compat] should support `maxPoolSize` with null options', (done) ->
            config = { otherKey: 'x', maxPoolSize: 2 }
            _buildOptions(config).should.be.deepEqual({ maxPoolSize: 2 })
            done()

        it '[compat] should override the `maxPoolSize` if provided as a separate option', (done) ->
            config = {
                options:
                    maxPoolSize: 2
                    server:
                        x: 1
                maxPoolSize: 4
            }
            _buildOptions(config).should.be.deepEqual({
                maxPoolSize: 4
                server:
                    x: 1
            })
            done()


    describe 'normalizeConfig', ->
        it 'should throw without config', (done) ->
            normalizeConfig.should.throw('`config` is not provided or is not an object')
            done()

        it 'should allow config with proper url', (done) ->
          config =
            url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'

          normalizeConfig(config).should.be.deepEqual(config)
          done()

        it 'should set default collection', (done) ->
          config =
            url: 'mongodb://aaa.bb.ccc:27101/some-db?ssl=true'

          normalizeConfig(config).collection.should.be.equal('_migrations')
          done()

        it 'should throw with wrong replicaset 1', (done) ->
            normalizeConfig.bind(null, {
                replicaset: 7
            }).should.throw('`replicaset` is not an object')
            done()

        it 'should throw with wrong replicaset 2', (done) ->
            normalizeConfig.bind(null, {
                replicaset: {}
            }).should.throw('`replicaset.name` is not set')
            done()

        it 'should throw with wrong replicaset 3', (done) ->
            normalizeConfig.bind(null, {
                replicaset: {
                    name: 'x'
                }
            }).should.throw('`replicaset.members` is not set or is not an array')
            done()

        it 'should throw with wrong replicaset 4', (done) ->
            normalizeConfig.bind(null, {
                replicaset: {
                    name: 'x',
                    members: 'lol'
                }
            }).should.throw('`replicaset.members` is not set or is not an array')
            done()

        it 'should throw with wrong replicaset 5', (done) ->
            normalizeConfig.bind(null, {
                replicaset: {
                    name: 'x',
                    members: [{ xost: 'x' }]
                }
            }).should.throw('each of `replicaset.members` must have `host` set')
            done()

        it 'should throw without host and replicaset', (done) ->
            normalizeConfig.bind(null, {
            }).should.throw('`host` is required when `replicaset` is not set')
            done()

        it 'should throw without db', (done) ->
            normalizeConfig.bind(null, {
                host: 'localhost'
            }).should.throw('`db` is not set')
            done()

        it 'should throw with password but without username', (done) ->
            normalizeConfig.bind(null, {
                host: 'localhost',
                db: '_mm',
                password: 'very secret password'
            }).should.throw('`password` provided but `user` is not')
            done()

        it 'should throw with authDatabase but without username', (done) ->
            normalizeConfig.bind(null, {
                host: 'localhost',
                db: '_mm',
                authDatabase: 'admin'
            }).should.throw('`authDatabase` provided but `user` is not')
            done()
