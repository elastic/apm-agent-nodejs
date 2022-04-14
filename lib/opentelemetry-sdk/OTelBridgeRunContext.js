'use strict'

const otel = require('@opentelemetry/api')

const { OTelBridgeNonRecordingSpan } = require('./OTelBridgeNonRecordingSpan')
const { OTelSpan } = require('./OTelSpan')
const { RunContext } = require('../instrumentation/run-context')
const Span = require('../instrumentation/span')

let SPAN_KEY = null

// `fetchSpanKey()` is called once during OTel SDK setup to get the `SPAN_KEY`
// that will be used by the OTel JS API during tracing -- when
// `otel.trace.setSpan(context, span)` et al are called.
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
  otel.trace.setSpan(capturingContext, fakeSpan)
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
      const curr = this.currSpan() || this.currTransaction()
      if (!curr) {
        return undefined
      } else if (curr instanceof OTelBridgeNonRecordingSpan) {
        return curr
      } else {
        return new OTelSpan(curr)
      }
    }
    return super.getValue(key)
  }

  setValue (key, value) {
    console.log('XXX OTelBridgeRunContext.setValue(%o, %s)', key, value)
    if (key === SPAN_KEY) {
      if (value instanceof OTelSpan) {
        if (value._span instanceof Span) {
          // XXX What if there isn't a current trans? Can this happen?
          return this.enterSpan(value._span)
        } else {
          // assert(value._span instanceof Transaction || value._span instanceof OTelBridgeNonRecordingSpan)
          return this.enterTrans(value._span)
        }
      } else if (typeof value.isRecording === 'function' && !value.isRecording()) {
        return this.enterTrans(new OTelBridgeNonRecordingSpan(value))
      } else {
        console.log('XXX WARNING: about this unexpected set value and ignore it')
      }
    }
    return super.setValue(key, value)
  }

  deleteValue (key) {
    console.log('XXX OTelBridgeRunContext.deleteValue(%o)', key)
    if (key === SPAN_KEY) {
      // XXX This deleteValue is used in opentelemetry-js/packages/opentelemetry-sdk-trace-base/src/Tracer.ts
      //    impl of startSpan if options.root is passed. IOW, its expects a returned context that
      //    has no current span or transaction. The context might still have baggage, etc. I suppose.
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
