'use strict'

const osdklog = require('./osdklog')
const { OTelBridgeRunContext } = require('./OTelBridgeRunContext')

// Implements interface ContextManager from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L43
class OTelContextManager {
  constructor (agent) {
    this._agent = agent
    this._ins = agent._instrumentation
  }

  active () {
    osdklog.apicall('OTelContextManager.active()')
    return this._ins.currRunContext()
  }

  with (otelContext, fn, thisArg, ...args) {
    osdklog.apicall('OTelContextManager.with(%s<...>, function %s, ...)', otelContext.constructor.name, fn.name || '<anonymous>')
    let runContext
    if (otelContext instanceof OTelBridgeRunContext) {
      runContext = otelContext
    } else {
      // `otelContext` is some object implementing OTel's `interface Context`
      // (typically a `BaseContext` from @opentelemetry/api). We derive a new
      // OTelBridgeRunContext from the root run-context that properly uses
      // the Context.
      runContext = this._ins._runCtxMgr.root().setOTelContext(otelContext)
    }
    return this._ins._runCtxMgr.with(runContext, fn, thisArg, ...args)
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
