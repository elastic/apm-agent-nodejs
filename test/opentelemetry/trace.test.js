'use strict'
// const { NoopTransport } = require('../../lib/noop-transport')
const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  transactionSampleRate: 1
})

const mockClient = require('../_mock_http_client')

const tape = require('tape')
const { trace, context } = require('@opentelemetry/api')
// const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')

const ElasticNodeTracerProvider = require('../../lib/opentelemetry/elastic-node-tracer-provider')
const ElasticOtelContextManager = require('../../lib/opentelemetry/elastic-otel-context-manager')

// function createTestExporter () {
//   return {
//     export: function () {}
//   }
// }

function initilizeTraceProvider () {
  const provider = new ElasticNodeTracerProvider({})
  provider.setAgent(agent)
  provider.register()
  context.setGlobalContextManager(new ElasticOtelContextManager(agent))
}

function resetAgent (expectedWrites, cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(expectedWrites, cb)
  agent.captureError = function (err) { throw err }
}

tape.test('transaction already started', function (t) {
  resetAgent(3, function (data) {
    const [span1, span2] = data.spans
    t.equals(data.transactions.length, 1, 'expected 1 transaction')
    t.equals(data.spans.length, 2, 'expected 2 spans')
    t.equals(span1.trace_id, span2.trace_id, 'spans part of same trace')

    t.true(
      span1.parent_id === span2.id || span2.parent_id === span1.id,
      'one span is child of the other span'
    )
    t.end()
  })
  initilizeTraceProvider(agent)

  // const ctx = context.active()
  const tracer = trace.getTracer('foo')
  const transaction = agent.startTransaction('starting transaction')
  tracer.startActiveSpan('test', {}, undefined, function (span1) {
    // const ctx2 = context.active()
    const span2 = tracer.startSpan('test2', {}, undefined)
    span2.end()
    span1.end()
    transaction.end()
  })
})

tape.test('transaction already started', function (t) {
  resetAgent(2, function (data) {
    t.equals(data.transactions.length, 1, 'expected 1 transaction')
    t.equals(data.spans.length, 1, 'expected 1 spans')
    const transaction = data.transactions[0]
    const span = data.spans[0]
    t.equals(span.trace_id, transaction.trace_id, 'span and transaction part of same trace')
    t.true(span.parent_id === transaction.id, 'span is child of transaction')
    t.end()
  })
  initilizeTraceProvider()
  const tracer = trace.getTracer('foo')
  tracer.startActiveSpan('test', {}, undefined, function (transaction) {
    const span = tracer.startSpan('test2', {})
    span.end()
    transaction.end()
  })
})
