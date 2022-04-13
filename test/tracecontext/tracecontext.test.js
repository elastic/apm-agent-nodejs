'use strict'
const agent = require('../..').start({
  serviceName: 'test-tracecontext',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0 // Always have span stacktraces.
})

const tape = require('tape')
const { TraceContext } = require('../../lib/tracecontext')
const TraceState = require('../../lib/tracecontext/tracestate')
const TraceParent = require('traceparent')

tape.test('propagateTraceContextHeaders tests', function (suite) {
  suite.test('Span test', function (t) {
    const traceParentString = '00-d3ced7e155ca7d275540a77e6ed5f931-ee2afc1f78c2cfa6-01'
    const traceStateString = 'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy'

    const transaction = agent.startTransaction('test-transaction', null, {
      childOf: traceParentString,
      tracestate: traceStateString
    })

    const span = transaction.startSpan('test-span')
    const newHeaders = {}
    span.propagateTraceContextHeaders(newHeaders, function (carrier, name, value) {
      carrier[name] = value
    })

    span.end()
    transaction.end()

    t.equals(span._context.traceparent.toString(), newHeaders.traceparent)
    t.equals(traceStateString, newHeaders.tracestate)
    t.equals(span._context.traceparent.toString(), newHeaders['elastic-apm-traceparent'])
    t.end()
  })

  suite.test('TraceContext test', function (t) {
    const traceParentString = '00-d3ced7e155ca7d275540a77e6ed5f931-ee2afc1f78c2cfa6-01'
    const traceStateString = 'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy'

    const fromContext = new TraceContext(
      TraceParent.fromString(traceParentString),
      TraceState.fromStringFormatString(traceStateString)
    )
    const context = new TraceContext()
    const headers = {}

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

    t.end()
  })

  suite.test('TraceContext null test', function (t) {
    const context = new TraceContext()
    context.propagateTraceContextHeaders(
      null, null, null
    )
    t.pass('propagateTraceContextHeaders handles null cases without crashing')
    t.end()
  })

  suite.test('TraceContext missing state', function (t) {
    const context = new TraceContext()
    const carrier = {}

    const mockContext = {
      toTraceParentString: function () {
        return 'test-parent'
      },
      toTraceStateString: function () {
        return null
      }
    }

    context.propagateTraceContextHeaders(
      carrier, mockContext, function (carrier, name, value) {
        carrier[name] = value
      }
    )
    t.equals(carrier.traceparent, 'test-parent')
    t.equals(carrier.tracestate, undefined)
    t.end()
  })

  suite.test('TraceContext missing parent', function (t) {
    const context = new TraceContext()
    const carrier = {}

    const mockContext = {
      toTraceParentString: function () {
        return null
      },
      toTraceStateString: function () {
        return 'test-state'
      }
    }

    context.propagateTraceContextHeaders(
      carrier, mockContext, function (carrier, name, value) {
        carrier[name] = value
      }
    )
    t.equals(carrier.traceparent, undefined)
    t.equals(carrier.tracestate, 'test-state')
    t.end()
  })
})
