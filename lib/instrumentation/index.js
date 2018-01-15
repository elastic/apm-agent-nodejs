'use strict'

var fs = require('fs')
var path = require('path')
var semver = require('semver')
var hook = require('require-in-the-middle')
var Transaction = require('./transaction')
var Queue = require('./queue')
var debug = require('debug')('elastic-apm')
var logger = require('../logger')
var request = require('../request')

var MODULES = ['http', 'https', 'generic-pool', 'mongodb-core', 'pg', 'mysql', 'express', 'hapi', 'redis', 'ioredis', 'bluebird', 'knex', 'koa-router', 'ws', 'graphql', 'express-graphql', 'elasticsearch', 'handlebars']

module.exports = Instrumentation

function Instrumentation (agent) {
  this._agent = agent
  this._queue = null
  this._started = false
  this.currentTransaction = null
}

Instrumentation.prototype.start = function () {
  if (!this._agent._conf.instrument) return

  var self = this
  this._started = true

  var qopts = {
    flushInterval: this._agent._conf.flushInterval,
    maxQueueSize: this._agent._conf.maxQueueSize
  }
  this._queue = new Queue(qopts, function onFlush (transactions, done) {
    Promise.all(transactions).then(function (transactions) {
      if (self._agent._conf.active && transactions.length > 0) {
        request.transactions(self._agent, transactions, done)
      }
    }, done)
  })

  if (this._agent._conf.asyncHooks && semver.gte(process.version, '8.2.0')) {
    require('./async-hooks')(this)
  } else {
    require('./patch-async')(this)
  }

  debug('shimming Module._load function')
  hook(MODULES, function (exports, name, basedir) {
    var pkg, version

    if (basedir) {
      pkg = path.join(basedir, 'package.json')
      try {
        version = JSON.parse(fs.readFileSync(pkg)).version
      } catch (e) {
        debug('could not shim %s module: %s', name, e.message)
        return exports
      }
    } else {
      version = process.versions.node
    }

    debug('shimming %s@%s module', name, version)
    return require('./modules/' + name)(exports, self._agent, version)
  })
}

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  if (this._started) {
    var queue = this._queue
    debug('adding transaction to queue %o', {id: transaction.id})
    // encode the transaction as early as possible in an attempt to free up
    // objects for garbage collection
    queue.add(new Promise(function (resolve, reject) {
      transaction._encode(function (err, payload) {
        // As of writing this comment, _encode swallows all errors. So the
        // following error handling logic shouldn't actually be needed
        if (err) reject(err)
        else resolve(payload)
      })
    }).catch(function (err) {
      logger.error('error encoding transaction %s: %s', transaction.id, err.message)
    }))
  } else {
    debug('ignoring transaction %o', {id: transaction.id})
  }
}

Instrumentation.prototype.startTransaction = function (name, type) {
  return new Transaction(this._agent, name, type)
}

Instrumentation.prototype.endTransaction = function () {
  if (!this.currentTransaction) return debug('cannot end transaction - no active transaction found')
  this.currentTransaction.end()
}

Instrumentation.prototype.setDefaultTransactionName = function (name) {
  var trans = this.currentTransaction
  if (!trans) return debug('no active transaction found - cannot set default transaction name')
  trans.setDefaultName(name)
}

Instrumentation.prototype.setTransactionName = function (name) {
  var trans = this.currentTransaction
  if (!trans) return debug('no active transaction found - cannot set transaction name')
  trans.name = name
}

Instrumentation.prototype.buildSpan = function () {
  if (!this.currentTransaction) {
    debug('no active transaction found - cannot build new span')
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

Instrumentation.prototype._recoverTransaction = function (trans) {
  if (this.currentTransaction === trans) return

  debug('recovering from wrong currentTransaction %o', {
    wrong: this.currentTransaction ? this.currentTransaction.id : undefined,
    correct: trans.id
  })

  this.currentTransaction = trans
}

Instrumentation.prototype.flush = function (cb) {
  this._queue._flush(cb)
}
