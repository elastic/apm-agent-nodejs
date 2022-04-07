'use strict'
const tape = require('tape')
const { TraceContext } = require('../../lib/tracecontext')
const TraceState = require('../../lib/tracecontext/tracestate')
const TraceParent = require('traceparent')

tape.test('trace context tests', function (suite) {
  suite.test('propagateTraceContextHeaders tests', function (t) {
    const traceParentString = '00-d3ced7e155ca7d275540a77e6ed5f931-ee2afc1f78c2cfa6-01'
    const traceStateString = 'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy'

    const fromContext = new TraceContext(
      TraceParent.fromString(traceParentString),
      TraceState.fromStringFormatString(traceStateString)
    )
    const context = new TraceContext()
    const headers = {}

    t.true(!context.hasPropagatedTraceContextHeaders())
    const newHeaders = Object.assign({}, headers)
    context.propagateTraceContextHeaders(
      newHeaders,
      fromContext,
      function (carrier, name, value) {
        if (!value) {
          return
        }
        carrier[name] = value
      }
    )
    t.equals(traceParentString, newHeaders.traceparent)
    t.equals(traceStateString, newHeaders.tracestate)
    t.true(context.hasPropagatedTraceContextHeaders())
    t.end()
  })
})
