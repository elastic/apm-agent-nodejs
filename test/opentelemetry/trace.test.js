'use strict'
const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  transactionSampleRate: 1
})

const tape = require('tape')
const {trace, context} = require('@opentelemetry/api')
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

const ElasticNodeTracerProvider = require('../../lib/opentelemetry/elastic-node-tracer-provider')

function createTestExporter() {
  return {
    export:function(){}
  }
  // return new ConsoleSpanExporter()
}

tape.test(function(t){
  const provider = new ElasticNodeTracerProvider({});
  provider.setAgent(agent)

  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      createTestExporter()
    )
  );
  provider.register()

  const ctx = context.active()
  const tracer = trace.getTracer('foo')
  // console.log(tracer)
  tracer.startActiveSpan('test', {}, ctx, function(span1){
    // console.log("this is a test")
    const ctx2 = context.active()
    const span2 = tracer.startSpan('test2',{},ctx2)
    // span2.end()
    // span1.end()
  })

  t.ok(true)
  t.end()
})
