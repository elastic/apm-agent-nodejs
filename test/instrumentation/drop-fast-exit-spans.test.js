/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { CapturingTransport } = require('../_capturing_transport')
const agent = require('../..').start({
  serviceName: 'test-fast-exit-span',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  exitSpanMinDuration: '10ms',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  transport () { return new CapturingTransport() }
})
const Transaction = require('../../lib/instrumentation/transaction')
const Span = require('../../lib/instrumentation/span')
const { OUTCOME_FAILURE } = require('../../lib/constants')
const mockClient = require('../_mock_http_client')
const tape = require('tape')

tape.test('discardable tests', function (t) {
  const trans = new Transaction(agent)
  const spanDefault = new Span(trans, 'foo', 'bar')
  t.equals(spanDefault.discardable, false, 'spans are not discardable by default')

  const spanExit = new Span(trans, 'foo', 'bar', { exitSpan: true })
  t.equals(spanExit.discardable, true, 'exit spans are discardable')

  const spanOutcome = new Span(trans, 'foo', 'bar', { exitSpan: true })
  t.equals(spanOutcome.discardable, true, 'exit spans are discardable')
  spanOutcome.setOutcome(OUTCOME_FAILURE)
  t.equals(spanOutcome.discardable, false, 'failed spans are not discardable')

  const spanPropagation = new Span(trans, 'foo', 'bar', { exitSpan: true })
  t.equals(spanPropagation.discardable, true, 'exit spans are discardable')

  const newHeaders = {}
  spanPropagation.propagateTraceContextHeaders(newHeaders, function (carrier, name, value) {
    carrier[name] = value
  })
  t.equals(spanPropagation.discardable, false, 'spans with propagated context are not discardable')
  t.end()
})

tape.test('end to end test', function (t) {
  resetAgent(function (data) {
    t.equals(data.length, 2)
    const span = data.spans.pop()
    t.equals(span.name, 'long span')
    t.end()
  })

  agent.startTransaction('test')
  const span1 = agent.startSpan('short span', 'type', 'subtype', 'action', { exitSpan: true })
  span1.end() // almost immediate, shorter than exitSpanMinDuraction

  const span2 = agent.startSpan('long span', 'type', 'subtype', 'action', { exitSpan: true })
  setTimeout(function () {
    span2.end()
    agent.endTransaction()
    agent.flush()
  }, 20) // longer than exitSpanMinDuration
})

function resetAgent (/* numExpected, */ cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(/* numExpected, */ cb)
  agent.captureError = function (err) { throw err }
}
