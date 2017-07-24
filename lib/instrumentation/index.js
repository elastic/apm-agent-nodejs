'use strict'

var fs = require('fs')
var path = require('path')
var hook = require('require-in-the-middle')
var Transaction = require('./transaction')
var Queue = require('./queue')
var debug = require('debug')('opbeat')
var request = require('../request')

var MODULES = ['http', 'https', 'generic-pool', 'mongodb-core', 'pg', 'mysql', 'express', 'hapi', 'redis', 'ioredis', 'bluebird', 'knex', 'koa-router', 'ws', 'graphql', 'express-graphql']

module.exports = Instrumentation

function Instrumentation (agent) {
  var self = this
  this._agent = agent
  this._queue = new Queue({flushInterval: agent._flushInterval}, function (result) {
    if (self._agent.active) request.transactions(self._agent, result)
  })
  this.currentTransaction = null
}

Instrumentation.prototype.start = function () {
  if (!this._agent.instrument) return

  require('./async-hooks')(this)

  var self = this

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
  if (this._agent.instrument) {
    debug('adding transaction to queue %o', { uuid: transaction._uuid })
    this._queue.add(transaction)
  } else {
    debug('ignoring transaction %o', { uuid: transaction._uuid })
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
  if (typeof original !== 'function' || original.name === 'opbeatCallbackWrapper') return original

  var ins = this
  var trans = this.currentTransaction

  return opbeatCallbackWrapper

  function opbeatCallbackWrapper () {
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
    wrong: this.currentTransaction ? this.currentTransaction._uuid : undefined,
    correct: trans._uuid
  })

  this.currentTransaction = trans
}
