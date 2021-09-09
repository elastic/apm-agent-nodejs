'use strict'

const asyncHooks = require('async_hooks')

const ADD_LISTENER_METHODS = [
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener'
]

// // A mapping of data for a run context. It is immutable -- setValue/deleteValue
// // methods return a new RunContext object.
// //
// // Same API as @opentelemetry/api `Context`. Implementation adapted from otel.
// // XXX notice
// // XXX move to run-context.js
// class RunContext {
//   constructor (parentKv) {
//     this._kv = parentKv ? new Map(parentKv) : new Map()
//   }
//   getValue (k) {
//     return this._kv.get(k)
//   }
//   setValue (k, v) {
//     const ctx = new RunContext(this._kv)
//     ctx._kv.set(k, v)
//     return ctx
//   }
//   deleteValue (k) {
//     const ctx = new RunContext(this._kv)
//     ctx._kv.delete(k)
//     return ctx
//   }
// }
//
// const ROOT_RUN_CONTEXT = new RunContext()

// XXX Could stand to make these vars accessible only via get* functions
//     to explicitly make RunContext instances immutable-except-for-binding-stack
// XXX This RunContext is very intimate with transaction and span semantics.
//     It should perhaps live in lib/instrumentation.
// XXX Is it acceptable that this can hold references to ended spans, only if
//     they are ended out of order, until the transaction is ended.
//     Theoretically there could be a pathological case there... limited by
//     transaction_max_spans.
class RunContext {
  constructor (tx, spans) {
    this.tx = tx
    this.spans = spans || []
  }

  isEmpty () {
    return !this.tx
  }

  // Returns the currently active span, if any, otherwise null.
  currSpan () {
    if (this.spans.length > 0) {
      return this.spans[this.spans.length - 1]
    } else {
      return null
    }
  }

  // Return a new RunContext with the given span added to the top of the spans
  // stack.
  enterSpan (span) {
    const newSpans = this.spans.slice()
    newSpans.push(span)
    return new RunContext(this.tx, newSpans)
  }

  // Return a new RunContext with the given span removed, or null if there is
  // no change (the given span isn't part of the run context).
  //
  // Typically this span is the top of stack (i.e. it is the current span).
  // However, it is possible to have out-of-order span.end() or even end a span
  // that isn't part of the current run context stack at all.
  // (See test/run-context/fixtures/end-non-current-spans.js for examples.)
  exitSpan (span) {
    let newRc = null
    let newSpans
    const lastSpan = this.spans[this.spans.length - 1]
    if (lastSpan && lastSpan.id === span.id) {
      // Fast path for common case: `span` is top of stack.
      newSpans = this.spans.slice(0, this.spans.length - 1)
      newRc = new RunContext(this.tx, newSpans)
    } else {
      const stackIdx = this.spans.findIndex(s => s.id === span.id)
      if (stackIdx !== -1) {
        newSpans = this.spans.slice(0, stackIdx).concat(this.spans.slice(stackIdx + 1))
        newRc = new RunContext(this.tx, newSpans)
      }
    }
    return newRc
  }

  toString () {
    const bits = []
    if (this.tx) {
      bits.push(`tx=${this.tx.name + (this.tx.ended ? '.ended' : '')}`)
    }
    if (this.spans.length > 0) {
      bits.push(`spans=[${this.spans.map(s => s.name + (s.ended ? '.ended' : '')).join(', ')}]`)
    }
    return `RC(${bits.join(', ')})`
  }
}

// A basic manager for run context. It handles a stack of run contexts, but does
// no automatic tracking (via async_hooks or otherwise).
//
// Same API as @opentelemetry/api `ContextManager`. Implementation adapted from
// @opentelemetry/context-async-hooks.
class BasicRunContextManager {
  constructor (log) {
    this._log = log
    this._root = new RunContext()
    this._stack = [] // Top of stack is the current run context.
    this._kListeners = Symbol('ElasticListeners')
  }

  enable () {
    return this
  }

  disable () {
    this._stack = []
    return this
  }

  // Reset state re-use of this context manager by tests in the same process.
  testReset () {
    this.disable()
    this.enable()
  }

  active () {
    return this._stack[this._stack.length - 1] || this._root
  }

  with (runContext, fn, thisArg, ...args) {
    this._enterContext(runContext)
    try {
      return fn.call(thisArg, ...args)
    } finally {
      this._exitContext()
    }
  }

  // The OTel ContextManager API has a single .bind() like this:
  //
  // bind (runContext, target) {
  //   if (target instanceof EventEmitter) {
  //     return this._bindEventEmitter(runContext, target)
  //   }
  //   if (typeof target === 'function') {
  //     return this._bindFunction(runContext, target)
  //   }
  //   return target
  // }
  //
  // Is there any value in this over our two separate `.bind*` methods?

  bindFunction (runContext, target) {
    if (typeof target !== 'function') {
      return target
    }
    this._log.trace('bind %s to fn "%s"', runContext, target.name)

    // XXX OTel equiv does *not* guard against double binding. The guard
    // against double binding here was added long ago when adding initial 'pg'
    // support. Not sure if there are other cases needing this. Double-binding
    // *should* effectively be a no-op.
    // Would be nice to drop the clumsy double-binding guard from the old code.

    const self = this
    const wrapper = function () {
      return self.with(runContext, () => target.apply(this, arguments))
    }
    Object.defineProperty(wrapper, 'length', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: target.length
    })

    return wrapper
  }

  // This implementation is adapted from OTel's AbstractAsyncHooksContextManager.ts.
  // XXX add ^ ref to NOTICE.md
  bindEventEmitter (runContext, ee) {
    // XXX add guard on `ee instanceof EventEmitter`? Probably, yes.

    const map = this._getPatchMap(ee)
    if (map !== undefined) {
      // No double-binding.
      return ee
    }
    this._createPatchMap(ee)

    // patch methods that add a listener to propagate context
    ADD_LISTENER_METHODS.forEach(methodName => {
      if (ee[methodName] === undefined) return
      ee[methodName] = this._patchAddListener(ee, ee[methodName], runContext)
    })
    // patch methods that remove a listener
    if (typeof ee.removeListener === 'function') {
      ee.removeListener = this._patchRemoveListener(ee, ee.removeListener)
    }
    if (typeof ee.off === 'function') {
      ee.off = this._patchRemoveListener(ee, ee.off)
    }
    // patch method that remove all listeners
    if (typeof ee.removeAllListeners === 'function') {
      ee.removeAllListeners = this._patchRemoveAllListeners(
        ee,
        ee.removeAllListeners
      )
    }
    return ee
  }

  // Patch methods that remove a given listener so that we match the "patched"
  // version of that listener (the one that propagate context).
  _patchRemoveListener (ee, original) {
    const contextManager = this
    return function (event, listener) {
      const map = contextManager._getPatchMap(ee)
      const listeners = map && map[event]
      if (listeners === undefined) {
        return original.call(this, event, listener)
      }
      const patchedListener = listeners.get(listener)
      return original.call(this, event, patchedListener || listener)
    }
  }

  // Patch methods that remove all listeners so we remove our internal
  // references for a given event.
  _patchRemoveAllListeners (ee, original) {
    const contextManager = this
    return function (event) {
      const map = contextManager._getPatchMap(ee)
      if (map !== undefined) {
        if (arguments.length === 0) {
          contextManager._createPatchMap(ee)
        } else if (map[event] !== undefined) {
          delete map[event]
        }
      }
      return original.apply(this, arguments)
    }
  }

  // Patch methods on an event emitter instance that can add listeners so we
  // can force them to propagate a given context.
  _patchAddListener (ee, original, runContext) {
    const contextManager = this
    return function (event, listener) {
      let map = contextManager._getPatchMap(ee)
      if (map === undefined) {
        map = contextManager._createPatchMap(ee)
      }
      let listeners = map[event]
      if (listeners === undefined) {
        listeners = new WeakMap()
        map[event] = listeners
      }
      const patchedListener = contextManager.bindFunction(runContext, listener)
      // store a weak reference of the user listener to ours
      listeners.set(listener, patchedListener)
      return original.call(this, event, patchedListener)
    }
  }

  _createPatchMap (ee) {
    const map = Object.create(null)
    ee[this._kListeners] = map
    return map
  }

  _getPatchMap (ee) {
    return ee[this._kListeners]
  }

  // XXX s/_enterContext/_enterRunContext/ et al
  _enterContext (runContext) {
    this._stack.push(runContext)
  }

  _exitContext () {
    this._stack.pop()
  }

  // ---- Additional public API added to support startTransaction/startSpan API.

  toString () {
    return `xid=${asyncHooks.executionAsyncId()} root=${this._root.toString()}, stack=[${this._stack.map(rc => rc.toString()).join(', ')}]`
  }

  // XXX rename to `replaceRunContext`
  // XXX This impl could just be `_exitContext(); _enterContext(rc)` right? If so, do that.
  replaceActive (runContext) {
    if (this._stack.length > 0) {
      this._stack[this._stack.length - 1] = runContext
    } else {
      // XXX TODO: explain the justification for implicitly entering a
      //     context for startTransaction/startSpan only if there isn't one
      this._stack.push(runContext)
    }
  }
}

// Based on @opentelemetry/context-async-hooks `AsyncHooksContextManager`.
// XXX notice
class AsyncHooksRunContextManager extends BasicRunContextManager {
  constructor (log) {
    super(log)
    // XXX testing: see if _contexts has lingering (leaked) contexts
    // XXX s/_contexts/_runContextFromAid
    this._contexts = new Map()
    this._asyncHook = asyncHooks.createHook({
      init: this._init.bind(this),
      before: this._before.bind(this),
      after: this._after.bind(this),
      destroy: this._destroy.bind(this),
      promiseResolve: this._destroy.bind(this)
    })
  }

  enable () {
    this._asyncHook.enable()
    return this
  }

  disable () {
    this._asyncHook.disable()
    this._contexts.clear()
    // XXX obsolete since changes to not touch `this._root`
    // this._root = new RunContext()
    this._stack = []
    return this
  }

  // Reset state re-use of this context manager by tests in the same process.
  testReset () {
    // Absent a core node async_hooks bug, the simple "test reset" would be
    // `this.disable(); this.enable()`. However there is a bug in Node.js
    // v12.0.0 - v12.2.0 (inclusive) where disabling the async hook could
    // result in it never getting re-enabled.
    // https://github.com/nodejs/node/issues/27585
    // https://github.com/nodejs/node/pull/27590 (included in node v12.3.0)
    this._contexts.clear()
    this._stack = []
  }

  /**
   * Init hook will be called when userland create a async context, setting the
   * context as the current one if it exist.
   * @param aid id of the async context
   * @param type the resource type
   */
  // XXX s/aid/asyncId/
  _init (aid, type, triggerAsyncId) {
    // ignore TIMERWRAP as they combine timers with same timeout which can lead to
    // false context propagation. TIMERWRAP has been removed in node 11
    // every timer has it's own `Timeout` resource anyway which is used to propagete
    // context.
    if (type === 'TIMERWRAP') return

    // XXX
    // const indent = ' '.repeat(triggerAsyncId % 80)
    // process._rawDebug(`${indent}${type}(${aid}): triggerAsyncId=${triggerAsyncId} executionAsyncId=${asyncHooks.executionAsyncId()}`);

    const context = this._stack[this._stack.length - 1]
    // XXX I think with the `replaceActive` change to not touch _root, this is obsolete:
    // if (!context && !this._root.isEmpty()) {
    //   // Unlike OTel's design, we must consider the `_root` context because
    //   // `apm.startTransaction()` can set a current transaction on the root
    //   // context.
    // }
    if (context !== undefined) {
      this._contexts.set(aid, context)
    }
  }

  /**
   * Destroy hook will be called when a given context is no longer used so we can
   * remove its attached context.
   * @param aid id of the async context
   */
  _destroy (aid) {
    this._contexts.delete(aid)
  }

  /**
   * Before hook is called just before executing a async context.
   * @param aid id of the async context
   */
  _before (aid) {
    const context = this._contexts.get(aid)
    if (context !== undefined) {
      this._enterContext(context)
    }
  }

  /**
   * After hook is called just after completing the execution of a async context.
   */
  _after () {
    this._exitContext()
  }
}

module.exports = {
  RunContext,
  BasicRunContextManager,
  AsyncHooksRunContextManager
}
