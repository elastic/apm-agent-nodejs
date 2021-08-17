'use strict'

const { EventEmitter } = require('events')
const asyncHooks = require('async_hooks')

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

  // Returns the currently active span, if any.
  //
  // Because the `startSpan()/endSpan()` API allows (a) affecting the current
  // run context and (b) out of order start/end, the "currently active span"
  // must skip over ended spans.
  currSpan () {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const span = this.spans[i]
      if (!span.ended) {
        return span
      }
    }
    return null
  }

  // This returns the top span in the span stack (even if it is ended).
  topSpan () {
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

    // Any ended spans at the top of the stack are cruft -- remove them.
    while (newSpans.length > 0 && newSpans[newSpans.length - 1].ended) {
      newSpans.pop()
    }

    newSpans.push(span)
    return new RunContext(this.tx, newSpans)
  }

  exitSpan () {
    const newSpans = this.spans.slice(0, this.spans.length - 1)

    // Pop all ended spans.  It is possible that spans lower in the stack have
    // already been ended. For example, in this code:
    //    var t1 = apm.startSpan('t1')
    //    var s2 = apm.startSpan('s2')
    //    var s3 = apm.startSpan('s3')
    //    var s4 = apm.startSpan('s4')
    //    s3.end() // out of order
    //    s4.end()
    // when `s4.end()` is called, the current run context will be:
    //    RC(tx=t1, spans=[s2, s3.ended, s4])
    // The final result should be:
    //    RC(tx=t1, spans=[s2])
    // so that `s2` becomes the current/active span.
    while (newSpans.length > 0 && newSpans[newSpans.length - 1].ended) {
      newSpans.pop()
    }

    return new RunContext(this.tx, newSpans)
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

  bind (runContext, target) {
    if (target instanceof EventEmitter) {
      return this._bindEventEmitter(runContext, target)
    }
    if (typeof target === 'function') {
      this._log.trace('bind %s to fn "%s"', runContext, target.name)
      return this._bindFunction(runContext, target)
    }
    return target
  }

  enable () {
    return this
  }

  disable () {
    return this
  }

  _bindFunction (runContext, target) {
    // XXX need guards against double-binding?
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

  // XXX TODO: _bindEventEmitter pull impl from instrumentation/index.js

  // XXX s/_enterContext/_enterRunContext/ et al
  _enterContext (runContext) {
    this._stack.push(runContext)
    this._log.trace({ ctxmgr: this.toString() }, '_enterContext %s', runContext)
  }

  _exitContext () {
    var popped = this._stack.pop()
    this._log.trace({ ctxmgr: this.toString() }, '_exitContext %s', popped)
  }

  // ---- Additional public API added to support startTransaction/startSpan API.
  // XXX That the ctx mgr knows anything about transactions and spans is lame.
  //     Can we move all those knowledge to instrumentation/index.js?

  toString () {
    return `xid=${asyncHooks.executionAsyncId()} root=${this._root.toString()}, stack=[${this._stack.map(rc => rc.toString()).join(', ')}]`
  }

  // XXX consider a better descriptive name for this.
  replaceActive (runContext) {
    if (this._stack.length > 0) {
      this._stack[this._stack.length - 1] = runContext
    } else {
      // XXX TODO: explain the justification for implicitly entering a
      //     context for startTransaction/startSpan only if there isn't one
      this._stack.push(runContext)
    }
    this._log.trace({ ctxmgr: this.toString() }, 'replaceActive %s', runContext)
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
    this._root = new RunContext()
    this._stack = []
    return this
  }

  /**
   * Init hook will be called when userland create a async context, setting the
   * context as the current one if it exist.
   * @param aid id of the async context
   * @param type the resource type
   */
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
