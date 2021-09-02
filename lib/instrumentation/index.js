'use strict'

var fs = require('fs')
var path = require('path')

var hook = require('require-in-the-middle')

var { Ids } = require('./ids')
var NamedArray = require('./named-array')
// XXX
// var shimmer = require('./shimmer')
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
  this._runCtxMgr = null

  this._log = agent.logger.child({ 'event.module': 'instrumentation' })

  // XXX TODO: handle all these curr tx/span properties
  // this.currentTransaction = null
  Object.defineProperty(this, 'currentTransaction', {
    get () {
      this._log.error('XXX getting <Instrumentation>.currentTransaction will be REMOVED, use .currTx()')
      return this.currTx()
    },
    set () {
      this._log.fatal('XXX setting <Instrumentation>.currentTransaction no longer works, refactor this code')
    }
  })

  // Span for binding callbacks
  // XXX
  // this.bindingSpan = null

  // Span which is actively bound
  // XXX
  // this.activeSpan = null

  Object.defineProperty(this, 'currentSpan', {
    get () {
      this._log.fatal('XXX getting <Instrumentation>.currentSpan is broken, use .currSpan()')
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

// Stop active instrumentation and reset global state *as much as possible*.
//
// Limitations: Removing and re-applying 'require-in-the-middle'-based patches
// has no way to update existing references to patched or unpatched exports from
// those modules.
Instrumentation.prototype.stop = function () {
  // Reset context tracking.
  this.currentTransaction = null
  this.bindingSpan = null
  this.activeSpan = null

  // Reset patching.
  this._started = false
  if (this._hook) {
    this._hook.unhook()
    this._hook = null
  }
}

Instrumentation.prototype.currTx = function () {
  if (!this._started) {
    return null
  }
  return this._runCtxMgr.active().tx || null
}
Instrumentation.prototype.currSpan = function () {
  if (!this._started) {
    return null
  }
  return this._runCtxMgr.active().currSpan()
}

// XXX deprecate this in favour of a `.ids()` or something
Object.defineProperty(Instrumentation.prototype, 'ids', {
  get () {
    console.warn('XXX deprecated ins.ids')
    const current = this.currSpan() || this.currTx()
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

// Reset internal state for (relatively) clean re-use of this Instrumentation.
// (This does *not* include redoing monkey patching.) Used for testing. It
// resets context tracking, so a subsequent test case can re-use the
// Instrumentation in the same process.
Instrumentation.prototype.testReset = function () {
  // XXX Do I really want this? Cleaner answer would be for tests to cleanly
  //     end their resources at the end of each test case. But what would that
  //     structure be? XXX
  if (this._runCtxMgr) {
    this._runCtxMgr.disable()
    this._runCtxMgr.enable()
  }
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
    return
  }

  const rc = this._runCtxMgr.active()
  if (rc.tx === transaction) {
    // Replace the active run context with an empty one. I.e. there is now
    // no active transaction or span (at least in this async task).
    this._runCtxMgr.replaceActive(new RunContext())

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

  // Replace the active run context with this span removed. Typically this
  // span is the top of stack (i.e. is the current span). However, it is
  // possible to have out-of-order span.end(), in which case the ended span
  // might not.
  const newRc = this._runCtxMgr.active().exitSpan(span)
  if (newRc) {
    this._runCtxMgr.replaceActive(newRc)
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

Instrumentation.prototype.enterTransRunContext = function (trans) {
  if (this._started) {
    // XXX 'splain
    const rc = new RunContext(trans)
    this._runCtxMgr.replaceActive(rc)
    this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'enterTransRunContext(<Trans %s>)', trans.name)
  }
}

Instrumentation.prototype.enterSpanRunContext = function (span) {
  if (this._started) {
    const rc = this._runCtxMgr.active().enterSpan(span)
    this._runCtxMgr.replaceActive(rc)
    this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'enterSpanRunContext(<Span %s>)', span.name)
  }
}

// Set the current run context to have *no* transaction. No spans will be
// created in this run context until a subsequent `startTransaction()`.
Instrumentation.prototype.enterEmptyRunContext = function () {
  if (this._started) {
    // XXX 'splain
    const rc = new RunContext()
    this._runCtxMgr.replaceActive(rc)
    this._log.debug({ ctxmgr: this._runCtxMgr.toString() }, 'enterEmptyRunContext()')
  }
}

Instrumentation.prototype.startTransaction = function (name, ...args) {
  const trans = new Transaction(this._agent, name, ...args)
  this.enterTransRunContext(trans)
  return trans
}

// XXX TODO remove this, put logic in agent.js
Instrumentation.prototype.endTransaction = function (result, endTime) {
  const trans = this.currTx()
  if (!trans) {
    this._agent.logger.debug('cannot end transaction - no active transaction found')
    return
  }
  trans.end(result, endTime)
}

// XXX TODO remove this, put logic in agent.js
Instrumentation.prototype.setDefaultTransactionName = function (name) {
  const trans = this.currTx()
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set default transaction name')
    return
  }
  trans.setDefaultName(name)
}

// XXX TODO remove this, put logic in agent.js
Instrumentation.prototype.setTransactionName = function (name) {
  const trans = this.currTx()
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set transaction name')
    return
  }
  trans.name = name
}

// XXX TODO remove this, put logic in agent.js
Instrumentation.prototype.setTransactionOutcome = function (outcome) {
  const trans = this.currTx()
  if (!trans) {
    this._agent.logger.debug('no active transaction found - cannot set transaction outcome')
    return
  }
  trans.setOutcome(outcome)
}

Instrumentation.prototype.startSpan = function (name, type, subtype, action, opts) {
  const tx = this.currTx()
  if (!tx) {
    this._agent.logger.debug('no active transaction found - cannot build new span')
    return null
  }
  return tx.startSpan.apply(tx, arguments)
}

// XXX
// var wrapped = Symbol('elastic-apm-wrapped-function')

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
// XXX
// Instrumentation.prototype.bindFunctionXXXold = function (original) {
//   if (typeof original !== 'function' || original.name === 'elasticAPMCallbackWrapper') return original
//
//   var ins = this
//   var trans = this.currentTransaction
//   var span = this.currentSpan
//   if (trans && !trans.sampled) {
//     return original
//   }
//
//   original[wrapped] = elasticAPMCallbackWrapper
//   // XXX: OTel equiv here sets `elasticAPMCallbackWrapper.length` to preserve
//   // that field. shimmer.wrap will do this. We could use shimmer for this?
//
//   return elasticAPMCallbackWrapper
//
//   function elasticAPMCallbackWrapper () {
//     var prevTrans = ins.currentTransaction
//     ins.currentTransaction = trans
//     // XXX
//     // ins.bindingSpan = null
//     ins.activeSpan = span
//     if (trans) trans.sync = false
//     if (span) span.sync = false
//     var result = original.apply(this, arguments)
//     ins.currentTransaction = prevTrans
//     return result
//   }
// }

Instrumentation.prototype.bindFunction = function (original) {
  return this._runCtxMgr.bindFunction(this._runCtxMgr.active(), original)
}

// XXX s/bindEmitter/bindEventEmitter/? Yes. There aren't that many.
Instrumentation.prototype.bindEmitter = function (ee) {
  this._runCtxMgr.bindEventEmitter(this._runCtxMgr.active(), ee)
}

// Instrumentation.prototype.bindEmitterXXXOld = function (emitter) {
//   var ins = this
//
//   // XXX Why not once, prependOnceListener here as in otel?
//   // Answer: https://github.com/elastic/apm-agent-nodejs/pull/371#discussion_r190747316
//   // Add a comment here to that effect for future maintainers?
//   var addMethods = [
//     'on',
//     'addListener',
//     'prependListener'
//   ]
//
//   var removeMethods = [
//     'off',
//     'removeListener'
//   ]
//
//   shimmer.massWrap(emitter, addMethods, (original) => function (name, handler) {
//     return original.call(this, name, ins.bindFunction(handler))
//   })
//
//   shimmer.massWrap(emitter, removeMethods, (original) => function (name, handler) {
//     // XXX LEAK With the new `bindFunction` above that does *not* set
//     //     `handler[wrapped]` we have re-introduced the event handler leak!!!
//     //     One way to fix that would be move the bindEmitter impl to
//     //     the context manager. I think we should do that and change the
//     //     single .bind() API to .bindFunction and .bindEventEmitter.
//     return original.call(this, name, handler[wrapped] || handler)
//   })
// }

Instrumentation.prototype._recoverTransaction = function (trans) {
  const currTrans = this.currTx()
  if (trans === currTrans) {
    return
  }

  // XXX how to handle this? Can we drop this whole _recoverTransaction?
  //     Can we repro it?
  console.warn('XXX _recoverTransaction hit')
  this._agent.logger.debug('recovering from wrong currentTransaction %o', {
    wrong: currTrans ? currTrans.id : undefined,
    correct: trans.id,
    trace: trans.traceId
  })
  this.currentTransaction = trans // XXX
}

// XXX also takes a Transaction
// Instrumentation.prototype.setCurrentSpan = function (span) {
// }
