'use strict'

const api = require('@opentelemetry/api')

const { RunContext } = require('../instrumentation/run-context')
const Transaction = require('../instrumentation/transaction')

// This is set to the symbol that the OTel JS API uses in
// `api.trace.setSpan(context, span)` to set/get the active span on a Context.
// This is used by OTelBridgeRunContext to intercept Context.setValue et al and
// translate to RunContext semantics for controlling the active/current span.
let SPAN_KEY = null

// XXX doc that this intercepts SPAN_KEY ...
// Implements interface Context from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L17
class OTelBridgeRunContext extends RunContext {
  getValue (key) {
    console.log('XXX OTelBridgeRunContext.getValue(%o)', key)
    if (key === SPAN_KEY) {
      return this.currSpan() || this.currTransaction() || undefined
    }
    return super.getValue(key)
  }

  setValue (key, value) {
    console.log('XXX OTelBridgeRunContext.setValue(%o, %s)', key, value)
    if (key === SPAN_KEY) {
      if (value._span instanceof Transaction) {
        return this.enterTrans(value._span)
      } else {
        return this.enterSpan(value._span)
      }
    }
    return super.setValue(key, value)
  }

  deleteValue (key) {
    console.log('XXX OTelBridgeRunContext.deleteValue(%o)', key)
    if (key === SPAN_KEY) {
      console.log('XXX deleteValue hi there SPAN_KEY')
      XXX
    }
    return super.deleteValue(key)
  }
}

function fetchSpanKey () {
  const capturingContext = {
    spanKey: null,
    setValue (key, value) {
      this.spanKey = key
    }
  }
  const fakeSpan = {}
  api.trace.setSpan(capturingContext, fakeSpan)
  SPAN_KEY = capturingContext.spanKey
  if (!SPAN_KEY) {
    throw new Error('could not fetch OTel API "SPAN_KEY"')
  }
}

module.exports = {
  fetchSpanKey,
  OTelBridgeRunContext
}
