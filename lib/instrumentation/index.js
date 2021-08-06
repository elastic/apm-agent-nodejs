'use strict'

var fs = require('fs')
var path = require('path')

var hook = require('require-in-the-middle')

var { Ids } = require('./ids')
var NamedArray = require('./named-array')
var shimmer = require('./shimmer')
var Transaction = require('./transaction')
const {
  RunContext,
  BasicRunContextManager,
  AsyncHooksRunContextManager
} = require('../run-context')

var MODULES = [
  '@elastic/elasticsearch',
  'apollo-server-core',
  'aws-sdk',
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
  ['hapi', '@hapi/hapi'],
  'http',
  'https',
  'http2',
  'ioredis',
  'jade',
  'knex',
  'koa',
  ['koa-router', '@koa/router'],
  'memcached',
  'mimic-response',
  'mongodb-core',
  'mongodb',
  'mysql',
  'mysql2',
  'pg',
  'pug',
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

  this._log = agent.logger.child({ 'event.module': 'instrumentation' })

  // XXX TODO: handle all these curr tx/span properties
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
    if (!Array.isArray(mod)) mod = [mod]
    const pathName = mod[0]

    this.addPatch(mod, (...args) => {
      // Lazy require so that we don't have to use `require.resolve` which
      // would fail in combination with Webpack. For more info see:
      // https://github.com/elastic/apm-agent-nodejs/pull/957
      return require(`./modules/${pathName}.js`)(...args)
    })
  }
}

Instrumentation.prototype.currTx = function () {
  return this._runCtxMgr.active().tx || null
}
Instrumentation.prototype.currSpan = function () {
  const spanStack = this._runCtxMgr.active().spans
  if (spanStack.length === 0) {
    return null
  } else {
    return spanStack[spanStack.length - 1]
  }
}
// XXX unneeded?
// Instrumentation.prototype.currParent = function () {
//   return this._runCtxMgr.active().topSpanOrTx()
// }

Object.defineProperty(Instrumentation.prototype, 'ids', {
  get () {
    const current = this.currentSpan || this.currentTransaction
    return current ? current.ids : new Ids()
  }
})

Instrumentation.prototype.addPatch = function (modules, handler) {
  if (!Array.isArray(modules)) modules = [modules]

  for (const mod of modules) {
    const type = typeof handler
    if (type !== 'function' && type !== 'string') {
      this._agent.logger.error('Invalid patch handler type: %s', type)
      return
    }

    this._patches.add(mod, handler)
  }

  this._startHook()
}

Instrumentation.prototype.removePatch = function (modules, handler) {
  if (!Array.isArray(modules)) modules = [modules]

  for (const mod of modules) {
    this._patches.delete(mod, handler)
  }

  this._startHook()
}

Instrumentation.prototype.clearPatches = function (modules) {
  if (!Array.isArray(modules)) modules = [modules]

  for (const mod of modules) {
    this._patches.clear(mod)
  }

  this._startHook()
}

Instrumentation.modules = Object.freeze(MODULES)

Instrumentation.prototype.start = function () {
  if (this._started) return
  this._started = true

  if (this._agent._conf.asyncHooks) {
    // XXX
    // require('./async-hooks')(this)
    this._runCtxMgr = new AsyncHooksRunContextManager(this._log)
  } else {
    this._runCtxMgr = new BasicRunContextManager(this._log)
    require('./patch-async')(this)
  }

  const patches = this._agent._conf.addPatch
  if (Array.isArray(patches)) {
    for (const [mod, path] of patches) {
      this.addPatch(mod, path)
    }
  }

  this._runCtxMgr.enable()
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
    var enabled = self._agent._conf.instrument && !disabled.has(name)
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

  if (!this._started) {
    agent.logger.debug('ignoring transaction %o', { trans: transaction.id, trace: transaction.traceId })
  }

  const rc = this._runCtxMgr.active()
  if (rc.tx === transaction) {
    // Replace the active run context with an empty one. I.e. there is now
    // no active transaction or span (at least in this async task).
    this._runCtxMgr.replaceActive(new RunContext())

    // XXX HACK Is it reasonable to clear the root run context here if its tx
    // is this ended transaction? Else it will hold a reference, and live on
    // as the root context.
    // const root = this._runCtxMgr._root // XXX HACK
    // if (root.tx === transaction) {
    //   this._runCtxMgr._root = new RunContext()
    // }

    this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'addEndedTransaction(%s)', transaction.name)
  }

  if (agent._conf.disableSend) {
    // Save effort if disableSend=true. This one log.trace related to
    // disableSend is included as a possible log hint to future debugging for
    // why events are not being sent to APM server.
    agent.logger.trace('disableSend: skip sendTransaction')
    return
  }

  var payload = agent._transactionFilters.process(transaction._encode())
  if (!payload) {
    agent.logger.debug('transaction ignored by filter %o', { trans: transaction.id, trace: transaction.traceId })
    return
  }

  agent.logger.debug('sending transaction %o', { trans: transaction.id, trace: transaction.traceId })
  agent._transport.sendTransaction(payload)
}

Instrumentation.prototype.addEndedSpan = function (span) {
  var agent = this._agent

  if (!this._started) {
    agent.logger.debug('ignoring span %o', { span: span.id, parent: span.parentId, trace: span.traceId, name: span.name, type: span.type })
    return
  }

  const rc = this._runCtxMgr.active()
  if (rc.topSpanOrTx() === span) {
    // Replace the active run context with this span popped off the stack,
    // i.e. this span is no longer active.
    this._runCtxMgr.replaceActive(rc.exitSpan())
  }
  this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'addEndedSpan(%s)', span.name)

  if (agent._conf.disableSend) {
    return
  }

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
}

Instrumentation.prototype.startTransaction = function (name, ...args) {
  const tx = new Transaction(this._agent, name, ...args)
  // XXX 'splain
  const rc = new RunContext(tx)
  this._runCtxMgr.replaceActive(rc)
  this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'startTransaction(%s)', tx.name)
  return tx
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

Instrumentation.prototype.setTransactionOutcome = function (outcome) {
  const trans = this.currentTransaction
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set transaction outcome')
    return
  }
  trans.setOutcome(outcome)
}

Instrumentation.prototype.startSpan = function (name, type, subtype, action, opts) {
  // XXX was this.currentTransaction
  const tx = this.currTx()
  if (!tx) {
    this._agent.logger.debug('no active transaction found - cannot build new span')
    return null
  }
  const span = tx.startSpan.apply(tx, arguments)
  if (span) {
    const rc = this._runCtxMgr.active().enterSpan(span)
    this._runCtxMgr.replaceActive(rc)
    this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'startSpan(%s)', span.name)
  }
  return span
}

Instrumentation.prototype.setSpanOutcome = function (outcome) {
  const span = this.activeSpan
  if (!span) {
    this._agent.logger.debug('no active span found - cannot set span outcome')
    return null
  }
  span.setOutcome(outcome)
}

var wrapped = Symbol('elastic-apm-wrapped-function')

// Binds a callback function to the currently active span
//
// An instrumentation programmer can use this function to wrap a callback
// function of another function at the call-time of the original function.
// The pattern is
//
// 1. Instrumentation programmer uses shimmer.wrap to wrap a function that also
//    has an asyncronous callback as an argument
//
// 2. In the code that executes before calling the original function, extract
//    the callback argument and pass it to bindFunction, which will return a
//    new function
//
// 3. Pass the function returned by bindFunction in place of the callback
//    argument when calling the original function.
//
// bindFunction function will "save" the currently active span via closure,
// and when the callback is invoked, the span and transaction active when
// the program called original function will be set as active.  This ensures
// the callback function gets instrument on "the right" transaction and span.
//
// The instrumentation programmer is still responsible for starting a span,
// and ending a span.  Additionally, this function will set a span's sync
// property to `false` -- it's up to the instrumentation programmer to ensure
// that the callback they're binding is really async.  If bindFunction is
// passed a callback that the wrapped function executes synchronously, it will
// still mark the span's `sync` property as `false`.
//
// @param {function} original
Instrumentation.prototype.bindFunctionXXXold = function (original) {
  if (typeof original !== 'function' || original.name === 'elasticAPMCallbackWrapper') return original

  var ins = this
  var trans = this.currentTransaction
  var span = this.currentSpan
  if (trans && !trans.sampled) {
    return original
  }

  original[wrapped] = elasticAPMCallbackWrapper
  // XXX: OTel equiv here sets `elasticAPMCallbackWrapper.length` to preserve
  // that field. shimmer.wrap will do this. We could use shimmer for this?

  return elasticAPMCallbackWrapper

  function elasticAPMCallbackWrapper () {
    var prevTrans = ins.currentTransaction
    ins.currentTransaction = trans
    ins.bindingSpan = null
    ins.activeSpan = span
    if (trans) trans.sync = false
    if (span) span.sync = false
    var result = original.apply(this, arguments)
    ins.currentTransaction = prevTrans
    return result
  }
}

Instrumentation.prototype.bindFunction = function (original) {
  // XXX need to worry about double-binding? Let .bind() handle it?
  // XXX what about span.sync=false setting that old bindFunction handles?!
  return this._runCtxMgr.bind(this._runCtxMgr.active(), original)
}

Instrumentation.prototype.bindEmitter = function (emitter) {
  var ins = this

  // XXX Why not once, prependOnceListener here as in otel?
  // Answer: https://github.com/elastic/apm-agent-nodejs/pull/371#discussion_r190747316
  // Add a comment here to that effect for future maintainers?
  var addMethods = [
    'on',
    'addListener',
    'prependListener'
  ]

  var removeMethods = [
    'off',
    'removeListener'
  ]

  shimmer.massWrap(emitter, addMethods, (original) => function (name, handler) {
    return original.call(this, name, ins.bindFunction(handler))
  })

  shimmer.massWrap(emitter, removeMethods, (original) => function (name, handler) {
    // XXX LEAK With the new `bindFunction` above that does *not* set
    //     `handler[wrapped]` we have re-introduced the event handler leak!!!
    //     One way to fix that would be move the bindEmitter impl to
    //     the context manager. I think we should do that and change the
    //     single .bind() API to .bindFunction and .bindEventEmitter.
    return original.call(this, name, handler[wrapped] || handler)
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

// XXX also takes a Transaction
// Instrumentation.prototype.setCurrentSpan = function (span) {
// }
