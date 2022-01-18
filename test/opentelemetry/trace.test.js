'use strict'
const tape = require('tape')
const {trace, context} = require('@opentelemetry/api')
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

const {ElasticNodeTracerProvider} = require('../lib/opentelemetry/bridge')


function createTestExporter() {
  return new ConsoleSpanExporter()
}

tape.test(function(t){
  const provider = new ElasticNodeTracerProvider();
  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      createTestExporter()
    )
  );
  provider.register()

  const ctx = context.active()
  const tracer = trace.getTracer('foo')
  tracer.startActiveSpan('test',{},ctx, function(span1){
    console.log("this is a test")
    const ctx2 = context.active()
    console.log(span1)
    const span2 = tracer.startSpan('test2',{},ctx2)
    span2.end()
    span1.end()
    // console.log(span.end())
  })

  t.ok(true)
  t.end()
})
