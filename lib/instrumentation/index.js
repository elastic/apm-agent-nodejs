'use strict'

var fs = require('fs')
var path = require('path')
var hook = require('require-in-the-middle')
var Transaction = require('./transaction')
var Queue = require('./queue')
var protocol = require('./protocol')
var debug = require('debug')('elastic-apm')
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
  if (!this._agent.instrument) return

  var self = this
  this._started = true

  var qopts = {
    flushInterval: this._agent._flushInterval,
    maxQueueSize: this._agent._maxQueueSize
  }
  this._queue = new Queue(qopts, function onFlush (transactions) {
    protocol.encode(transactions, function onEncoded (err, payload) {
      if (err) {
        debug('queue returned error: %s', err.message)
      } else if (self._agent.active && payload) {
        request.transactions(self._agent, payload)
      }
    })
  })

  require('./patch-async')(this)

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
    debug('adding transaction to queue %o', {id: transaction.id})
    this._queue.add(transaction)
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

Instrumentation.prototype.buildTrace = function () {
  if (!this.currentTransaction) {
    debug('no active transaction found - cannot build new trace')
    return null
  }

  return this.currentTransaction.buildTrace()
}

Instrumentation.prototype.bindFunction = function (original) {
  if (typeof original !== 'function' || original.name === 'elasticAPMCallbackWrapper') return original

  var ins = this
  var trans = this.currentTransaction

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
