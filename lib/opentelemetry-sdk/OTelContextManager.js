'use strict'

const otel = require('@opentelemetry/api')

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
      // XXX set our own key on runContext.setValue(OTEL_CONTEXT_KEY, otelContext)
      //    so it gets carried through. Then the OTelBridgeRunContext getValue needs
      //    to look that up. Feels weird to de-couple those. Possible/better to have
      //    a special method on runContext class?
      //      const runContext = runContext.setOTelContext(otelContext)
      //    which does both. Or `.fromOTelContext`?
      runContext = this._ins._runCtxMgr.root().setOTelContext(otelContext)

      // // `otelContext` is some object implementing OTel's `interface Context`,
      // // typically a `BaseContext` from @opentelemetry/api.
      // // XXX HERE
      // // - It might have a set span for us to use.
      // //    const span = otel.trace.getSpan(otelContext)
      // // - It might have other context to carry through.
      // // function runContextFromOTelContext // XXX make this fn to re-use in bind() below
      // runContext = this._ins._runCtxMgr.root()
      // var span = otel.trace.getSpan(otelContext)
      // // XXX how to handle fields?
      // //    Perhaps the proxy class can encapsulate the set SPAN_KEY as well?
      // // quick hack for now, without fields
      // if (span) {
      //   // XXX If this span isn't OTelSpan, then what?
      //   runContext = otel.trace.setSpan(runContext, span)
      // }
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
