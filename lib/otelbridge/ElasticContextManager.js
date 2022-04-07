'use strict'

const { ROOT_RUN_CONTEXT } = require('../instrumentation/run-context')

// Implements interface Context from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L17
//
// This is *not* exported because, by design, all creation of OTelContext
// objects should be done by the OTelContextManager below. Nothing outside
// of it should need to directly access the OTelContext class.
class OTelContext {
  constructor (runContext) {
    this._runContext = runContext
  }

  toString () {
    return `<OTelContext: ${this._runContext.toString()}>`
  }

  // noop
  getValue (key) {
    console.log('XXX OTelContext.getValue(%o)', key)
    return undefined
  }

  setValue (key, value) {
    console.log('XXX OTelContext.setValue(%o, %s)', key, value)
    return this
  }

  deleteValue (key) {
    console.log('XXX OTelContext.deleteValue(%o)', key)
    return this
  }

  // constructor (fields) {
  //   this._fields = fields ? new Map(fields) : new Map()
  // }

  // toString () {
  //   return `<OTelContext: keys=${this._fields.keys().toString()}>`
  // }

  // getValue (key) {
  //   console.log('XXX OTelContext.getValue(%o)', key)
  //   return this._fields.get(key)
  // }

  // setValue (key, value) {
  //   console.log('XXX OTelContext.setValue(%o, %s)', key, value)
  //   const otelContext = new OTelContext(this._fields)
  //   otelContext._fields.set(key, value)
  //   return otelContext
  // }

  // deleteValue (key) {
  //   console.log('XXX OTelContext.deleteValue(%o)', key)
  //   const otelContext = new OTelContext(this._fields)
  //   otelContext._fields.delete(key)
  //   return otelContext
  // }

  // XXX
  // /**
  //  * Get a value from the context.
  //  *
  //  * @param key key which identifies a context value
  //  */
  //  getValue(key: symbol): unknown;

  //  /**
  //   * Create a new context which inherits from this context and has
  //   * the given key set to the given value.
  //   *
  //   * @param key context key for which to set the value
  //   * @param value value to set for the given key
  //   */
  //  setValue(key: symbol, value: unknown): Context;

  //  /**
  //   * Return a new context which inherits from this context but does
  //   * not contain a value for the given key.
  //   *
  //   * @param key context key for which to clear a value
  //   */
  //  deleteValue(key: symbol): Context;
}

// Implements interface ContextManager from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L43
class OTelContextManager {
  constructor (agent) {
    this._agent = agent
    this._ins = agent._instrumentation
    this._root = new OTelContext(ROOT_RUN_CONTEXT)
  }

  active () {
    console.log('XXX OTelContextManager.active()')
    const currRunContext = this._ins.currRunContext()
    // XXX WeakMap runContext -> otelContext  _otelContextFromRunContext
    //      or runContext._otelContextCache
    if (currRunContext === ROOT_RUN_CONTEXT) {
      return this._root
    } else {
      console.log('XXX OTelContextManager.active() should wrap currRunContext: %s', currRunContext)
      // XXX can we cache this? else every call is creating a wrapper object. ... weakmap?
      //     Or support on RunContext to cache this thing.
      return this._root // XXX
    }
  }

  with (otelContext, fn, thisArg, ...args) {
    console.log('XXX OTelContextManager.with(%s, function %s, ...)', otelContext, fn.name)
    // XXX Construct/get a RunContext for this `otelContext` and call _runCtxMgr.with(runContext, ...)
    return fn.call(thisArg, ...args)
  }

  bind (otelContext, target) {
    console.log('XXX OTelContextManager.bind(%s, %s type)', otelContext, typeof target)
    return target
  }

  enable () {
    console.log('XXX OTelContextManager.enable()')
    return this
  }

  disable () {
    console.log('XXX OTelContextManager.disable()')
    return this
  }
}

module.exports = {
  OTelContextManager
}
