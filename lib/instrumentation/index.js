'use strict'

var fs = require('fs')
var path = require('path')

var AsyncValuePromise = require('async-value-promise')
var hook = require('require-in-the-middle')
var semver = require('semver')

var Queue = require('../queue')
var request = require('../request')
var Transaction = require('./transaction')
var shimmer = require('./shimmer')

var MODULES = [
  'apollo-server-core',
  'bluebird',
  'cassandra-driver',
  'elasticsearch',
  'express',
  'express-graphql',
  'express-queue',
  'finalhandler',
  'generic-pool',
  'graphql',
  'handlebars',
  'hapi',
  'http',
  'https',
  'http2',
  'ioredis',
  'knex',
  'koa-router',
  'mimic-response',
  'mongodb-core',
  'mysql',
  'mysql2',
  'pg',
  'redis',
  'restify',
  'tedious',
  'ws'
]

module.exports = Instrumentation

function Instrumentation (agent) {
  this._agent = agent
  this._queue = null
  this._hook = null // this._hook is only exposed for testing purposes
  this._started = false
  this.currentTransaction = null
}

Instrumentation.modules = Object.freeze(MODULES)

Instrumentation.prototype.start = function () {
  if (!this._agent._conf.instrument) return

  var self = this
  this._started = true

  var qopts = {
    flushInterval: this._agent._conf.flushInterval,
    maxQueueSize: this._agent._conf.maxQueueSize,
    logger: this._agent.logger
  }
  this._queue = new Queue(qopts, function onFlush (transactions, done) {
    AsyncValuePromise.all(transactions).then(function (transactions) {
      if (self._agent._conf.active && transactions.length > 0) {
        request.transactions(self._agent, transactions, done)
      } else {
        done()
      }
    }, done)
  })

  if (this._agent._conf.asyncHooks && semver.gte(process.version, '8.2.0')) {
    require('./async-hooks')(this)
  } else {
    require('./patch-async')(this)
  }

  var disabled = new Set(this._agent._conf.disableInstrumentations)

  this._agent.logger.debug('adding hook to Node.js module loader')

  this._hook = hook(MODULES, function (exports, name, basedir) {
    var enabled = !disabled.has(name)
    var pkg, version

    if (basedir) {
      pkg = path.join(basedir, 'package.json')
      try {
        version = JSON.parse(fs.readFileSync(pkg)).version
      } catch (e) {
        self._agent.logger.debug('could not shim %s module: %s', name, e.message)
        return exports
      }
    } else {
      version = process.versions.node
    }

    return self._patchModule(exports, name, version, enabled)
  })
}

Instrumentation.prototype._patchModule = function (exports, name, version, enabled) {
  this._agent.logger.debug('shimming %s@%s module', name, version)
  return require('./modules/' + name)(exports, this._agent, version, enabled)
}

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  if (this._started) {
    var queue = this._queue

    this._agent.logger.debug('adding transaction to queue %o', { id: transaction.id })

    var payload = new AsyncValuePromise()

    payload.catch(function (err) {
      this._agent.logger.error('error encoding transaction %s: %s', transaction.id, err.message)
    })

    // Add the transaction payload to the queue instead of the transation
    // object it self to free up the transaction for garbage collection
    transaction._encode(function (err, _payload) {
      if (err) payload.reject(err)
      else payload.resolve(_payload)
    })

    queue.add(payload)
  } else {
    this._agent.logger.debug('ignoring transaction %o', { id: transaction.id })
  }
}

Instrumentation.prototype.startTransaction = function (name, type) {
  return new Transaction(this._agent, name, type)
}

Instrumentation.prototype.endTransaction = function (result) {
  if (!this.currentTransaction) {
    this._agent.logger.debug('cannot end transaction - no active transaction found')
    return
  }
  this.currentTransaction.end(result)
}

Instrumentation.prototype.setDefaultTransactionName = function (name) {
  var trans = this.currentTransaction
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set default transaction name')
    return
  }
  trans.setDefaultName(name)
}

Instrumentation.prototype.setTransactionName = function (name) {
  var trans = this.currentTransaction
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set transaction name')
    return
  }
  trans.name = name
}

Instrumentation.prototype.buildSpan = function () {
  if (!this.currentTransaction) {
    this._agent.logger.debug('no active transaction found - cannot build new span')
    return null
  }

  return this.currentTransaction.buildSpan()
}

Instrumentation.prototype.bindFunction = function (original) {
  if (typeof original !== 'function' || original.name === 'elasticAPMCallbackWrapper') return original

  var ins = this
  var trans = this.currentTransaction
  if (trans && !trans.sampled) {
    return original
  }

  return elasticAPMCallbackWrapper

  function elasticAPMCallbackWrapper () {
    var prev = ins.currentTransaction
    ins.currentTransaction = trans
    var result = original.apply(this, arguments)
    ins.currentTransaction = prev
    return result
  }
}

Instrumentation.prototype.bindEmitter = function (emitter) {
  var ins = this

  var methods = [
    'on',
    'addListener'
  ]

  if (semver.satisfies(process.versions.node, '>=6')) {
    methods.push('prependListener')
  }

  shimmer.massWrap(emitter, methods, (original) => function (name, handler) {
    return original.call(this, name, ins.bindFunction(handler))
  })
}

Instrumentation.prototype._recoverTransaction = function (trans) {
  if (this.currentTransaction === trans) return

  this._agent.logger.debug('recovering from wrong currentTransaction %o', {
    wrong: this.currentTransaction ? this.currentTransaction.id : undefined,
    correct: trans.id
  })

  this.currentTransaction = trans
}

Instrumentation.prototype.flush = function (cb) {
  if (this._queue) {
    this._queue.flush(cb)
  } else {
    process.nextTick(cb)
  }
}
