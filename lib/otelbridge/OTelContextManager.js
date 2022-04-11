'use strict'

// Implements interface ContextManager from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L43
//
// XXX If we get AbstractRunContextManager to implement `.bind` we *might* be
//     able to use `_runCtxMgr` directly as the global ContextManager for OTel.
class OTelContextManager {
  constructor (agent) {
    this._agent = agent
    this._ins = agent._instrumentation
  }

  active () {
    console.log('XXX OTelContextManager.active()')
    return this._ins.currRunContext()
  }

  with (context, fn, thisArg, ...args) {
    console.log('XXX OTelContextManager.with(%s, function %s, ...)', context, fn.name)
    return this._ins._runCtxMgr.with(context, fn, thisArg, ...args)
  }

  bind (otelContext, target) {
    console.log('XXX OTelContextManager.bind(%s, %s type)', otelContext, typeof target)
    // XXX pass this through
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
