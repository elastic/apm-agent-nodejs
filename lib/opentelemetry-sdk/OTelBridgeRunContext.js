'use strict'

const api = require('@opentelemetry/api')

const { RunContext } = require('../instrumentation/run-context')
const Transaction = require('../instrumentation/transaction')

let SPAN_KEY = null

// `fetchSpanKey()` is called once during OTel SDK setup to get the `SPAN_KEY`
// that will be used by the OTel JS API during tracing -- when
// `api.trace.setSpan(context, span)` et al are called.
//
// The fetched SPAN_KEY is used later by OTelBridgeRunContext to intercept
// `Context.{get,set,delete}Value` and translate to the agent's internal
// RunContext semantics for controlling the active/current span.
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

// This is a subclass of RunContext that is used when the agent's OTel SDK
// is enabled. It bridges between the OTel API's `Context.setValue(SPAN_KEY,
// ...)` and the internal RunContext current span tracking.
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
      throw new Error('XXX')
    }
    return super.deleteValue(key)
  }
}

module.exports = {
  fetchSpanKey,
  OTelBridgeRunContext
}
