'use strict'

const osdklog = require('./osdklog')

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
    osdklog.apicall('OTelContextManager.active()')
    return this._ins.currRunContext()
  }

  with (context, fn, thisArg, ...args) {
    osdklog.apicall('OTelContextManager.with(%s, function %s, ...)', context, fn.name)
    // XXX handle this context not being an OTelBridgeRunContext. Might be BaseContext.
    return this._ins._runCtxMgr.with(context, fn, thisArg, ...args)
  }

  bind (otelContext, target) {
    osdklog.apicall('OTelContextManager.bind(%s, %s type)', otelContext, typeof target)
    // XXX pass this through
    return target
  }

  enable () {
    osdklog.apicall('OTelContextManager.enable()')
    return this
  }

  disable () {
    osdklog.apicall('OTelContextManager.disable()')
    return this
  }
}

module.exports = {
  OTelContextManager
}
