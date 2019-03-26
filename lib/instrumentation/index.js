'use strict'

var fs = require('fs')
var path = require('path')

var hook = require('require-in-the-middle')
var semver = require('semver')

var NamedArray = require('./named-array')
var shimmer = require('./shimmer')
var Transaction = require('./transaction')

var MODULES = [
  'apollo-server-core',
  'bluebird',
  'cassandra-driver',
  'elasticsearch',
  'express',
  'express-graphql',
  'express-queue',
  'fastify',
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
  'koa',
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

  // NOTE: we need to track module names for patches
  // in a separate array rather than using Object.keys()
  // because the array is given to the hook(...) call.
  this._patches = new NamedArray()

  for (let mod of MODULES) {
    this.addPatch(mod, require.resolve(`./modules/${mod}`))
  }
}

Instrumentation.prototype.addPatch = function (name, handler) {
  const type = typeof handler
  if (type !== 'function' && type !== 'string') {
    this._agent.logger.error('Invalid patch handler type:', type)
    return
  }

  this._patches.add(name, handler)
  this._startHook()
}

Instrumentation.prototype.removePatch = function (name, handler) {
  this._patches.delete(name, handler)
  this._startHook()
}

Instrumentation.prototype.clearPatches = function (name) {
  this._patches.clear(name)
  this._startHook()
}

Instrumentation.modules = Object.freeze(MODULES)

Instrumentation.prototype.start = function () {
  if (!this._agent._conf.instrument) return
  if (this._started) return

  this._started = true

  if (this._agent._conf.asyncHooks && semver.gte(process.version, '8.2.0')) {
    require('./async-hooks')(this)
  } else {
    require('./patch-async')(this)
  }

  const patches = this._agent._conf.addPatch
  if (Array.isArray(patches)) {
    for (let [mod, path] of patches) {
      this.addPatch(mod, path)
    }
  }

  this._startHook()
}

Instrumentation.prototype._startHook = function () {
  if (!this._started) return
  if (this._hook) {
    this._agent.logger.debug('removing hook to Node.js module loader')
    this._hook.unhook()
  }

  var self = this
  var disabled = new Set(this._agent._conf.disableInstrumentations)

  this._agent.logger.debug('adding hook to Node.js module loader')

  this._hook = hook(this._patches.keys, function (exports, name, basedir) {
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
  var patches = this._patches.get(name)
  if (patches) {
    for (let patch of patches) {
      if (typeof patch === 'string') {
        if (patch[0] === '.') {
          patch = path.resolve(process.cwd(), patch)
        }
        patch = require(patch)
      }

      const type = typeof patch
      if (type !== 'function') {
        this._agent.logger.error('Invalid patch handler type "%s" for module "%s"', type, name)
        continue
      }

      exports = patch(exports, this._agent, { version, enabled })
    }
  }
  return exports
}

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  var agent = this._agent

  if (this._started) {
    var payload = agent._transactionFilters.process(transaction._encode())
    if (!payload) return agent.logger.debug('transaction ignored by filter %o', { trans: transaction.id, trace: transaction.traceId })
    agent.logger.debug('sending transaction %o', { trans: transaction.id, trace: transaction.traceId })
    agent._transport.sendTransaction(payload)
  } else {
    agent.logger.debug('ignoring transaction %o', { trans: transaction.id, trace: transaction.traceId })
  }
}

Instrumentation.prototype.addEndedSpan = function (span) {
  var agent = this._agent

  if (this._started) {
    agent.logger.debug('encoding span %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type })
    span._encode(function (err, payload) {
      if (err) {
        agent.logger.error('error encoding span %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type, error: err.message })
        return
      }

      payload = agent._spanFilters.process(payload)

      if (!payload) {
        agent.logger.debug('span ignored by filter %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type })
        return
      }

      agent.logger.debug('sending span %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type })
      if (agent._transport) agent._transport.sendSpan(payload)
    })
  } else {
    agent.logger.debug('ignoring span %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type })
  }
}

Instrumentation.prototype.startTransaction = function (name, type, opts) {
  // To be backwards compatible with the old API, we also accept a `traceparent` string
  if (typeof opts === 'string') opts = { childOf: opts }

  return new Transaction(this._agent, name, type, opts)
}

Instrumentation.prototype.endTransaction = function (result, endTime) {
  if (!this.currentTransaction) {
    this._agent.logger.debug('cannot end transaction - no active transaction found')
    return
  }
  this.currentTransaction.end(result, endTime)
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

Instrumentation.prototype.startSpan = function () {
  if (!this.currentTransaction) {
    this._agent.logger.debug('no active transaction found - cannot build new span')
    return null
  }

  return this.currentTransaction.startSpan.apply(this.currentTransaction, arguments)
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
    correct: trans.id,
    trace: trans.traceId
  })

  this.currentTransaction = trans
}
