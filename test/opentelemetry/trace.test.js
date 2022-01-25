'use strict'
// const { NoopTransport } = require('../../lib/noop-transport')
const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  transactionSampleRate: 1,
  // transport: function() {
  //   return new NoopTransport
  // }
})

const mockClient = require('../_mock_http_client')

const tape = require('tape')
const {trace, context} = require('@opentelemetry/api')
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

const ElasticNodeTracerProvider = require('../../lib/opentelemetry/elastic-node-tracer-provider')

function createTestExporter() {
  return {
    export:function(){}
  }
}

function initilizeTraceProvider() {
  const provider = new ElasticNodeTracerProvider({});
  provider.setAgent(agent)

  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      createTestExporter()
    )
  );
  provider.register()
}

function resetAgent (expectedWrites, cb) {
  agent._instrumentation.testReset()
  agent._transport = mockClient(expectedWrites, cb)
  agent.captureError = function (err) { throw err }
}

// tape.test('transaction already started',function(t){
//   resetAgent(3, function(data) {
//     const [span1, span2] = data.spans
//     t.equals(data.transactions.length, 1, 'expected 1 transaction')
//     t.equals(data.spans.length, 2, 'expected 2 spans')
//     t.equals(span1.trace_id, span2.trace_id, 'spans part of same trace')

//     t.true(
//       span1.parent_id == span2.id || span2.parent_id == span1.id,
//       'one span is child of the other span'
//     )
//     t.end()
//   })
//   const provider = initilizeTraceProvider(agent)

//   const ctx = context.active()
//   const tracer = trace.getTracer('foo')
//   const transaction = agent.startTransaction('starting transaction')
//   tracer.startActiveSpan('test', {}, ctx, function(span1){
//     const ctx2 = context.active()
//     const span2 = tracer.startSpan('test2',{},ctx2)
//     span2.end()
//     span1.end()
//     transaction.end()
//   })
// })

tape.test('transaction already started',function(t){
  const provider = initilizeTraceProvider()
  const ctx = context.active()
  const tracer = trace.getTracer('foo')
  tracer.startActiveSpan('test', {}, ctx, function(span1){
    const ctx2 = context.active()
    const span2 = tracer.startSpan('test2',{},ctx2)
    span2.end()
    span1.end()
    t.end()
  })
})

// otel_span contains the properties set through the OTel API
// span_or_transaction = null;
// if (otel_span.remote_contex != null) {
//     span_or_transaction = createTransactionWithParent(otel_span.remote_context);
// } else if (otel_span.parent == null) {
//     span_or_transaction = createRootTransaction();
// } else {
//     span_or_transaction = createSpanWithParent(otel_span.parent);
// }
