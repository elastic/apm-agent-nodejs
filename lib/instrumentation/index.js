'use strict'

var fs = require('fs')
var path = require('path')

var hook = require('require-in-the-middle')
var semver = require('semver')

var Transaction = require('./transaction')
var shimmer = require('./shimmer')

var MODULES = [
  'bluebird',
  'cassandra-driver',
  'elasticsearch',
  'express',
  'express-graphql',
  'express-queue',
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
  this._hook = null // this._hook is only exposed for testing purposes
  this._started = false
  this.currentTransaction = null

  // Span for binding callbacks
  this.bindingSpan = null

  // Span which is actively bound
  this.activeSpan = null

  Object.defineProperty(this, 'currentSpan', {
    get () {
      return this.bindingSpan || this.activeSpan
    }
  })
}

Instrumentation.modules = Object.freeze(MODULES)

Instrumentation.prototype.start = function () {
  if (!this._agent._conf.instrument) return

  var self = this
  this._started = true

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
  var agent = this._agent

  if (this._started) {
    var payload = agent._transactionFilters.process(transaction._encode())
    if (!payload) return agent.logger.debug('transaction ignored by filter %o', { id: transaction.id })
    agent.logger.debug('sending transaction %o', { id: transaction.id })
    agent._apmServer.sendTransaction(payload)
  } else {
    agent.logger.debug('ignoring transaction %o', { id: transaction.id })
  }
}

Instrumentation.prototype.addEndedSpan = function (span) {
  var agent = this._agent

  if (this._started) {
    agent.logger.debug('encoding span %o', { trans: span.transaction.id, name: span.name, type: span.type })
    span._encode(function (err, payload) {
      if (err) {
        agent.logger.error('error encoding span %o', { trans: span.transaction.id, name: span.name, type: span.type, error: err.message })
        return
      }

      payload = agent._spanFilters.process(payload)

      if (!payload) {
        agent.logger.debug('span ignored by filter %o', { trans: span.transaction.id, name: span.name, type: span.type })
        return
      }

      agent.logger.debug('sending span %o', { trans: span.transaction.id, name: span.name, type: span.type })
      if (agent._apmServer) agent._apmServer.sendSpan(payload)
    })
  } else {
    agent.logger.debug('ignoring span %o', { trans: span.transaction.id, name: span.name, type: span.type })
  }
}

Instrumentation.prototype.startTransaction = function (name, type, traceparent) {
  return new Transaction(this._agent, name, type, traceparent)
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
  var span = this.currentSpan
  if (trans && !trans.sampled) {
    return original
  }

  return elasticAPMCallbackWrapper

  function elasticAPMCallbackWrapper () {
    var prevTrans = ins.currentTransaction
    ins.currentTransaction = trans
    ins.bindingSpan = null
    ins.activeSpan = span
    var result = original.apply(this, arguments)
    ins.currentTransaction = prevTrans
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
