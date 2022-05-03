const assert = require('assert')

// https://github.com/cucumber/cucumber-js/blob/HEAD/docs/support_files/api_reference.md
const { Then, Given, After } = require('@cucumber/cucumber')

const agent = require('../..')
const otel = require('@opentelemetry/api')
const Transaction = require('../../lib/instrumentation/transaction')
const Span = require('../../lib/instrumentation/span')
const { executionAsyncId } = require('async_hooks')

Given('an agent', function () {
  if (!agent.isStarted()) {
    agent.start({
      opentelemetrySdk: true
    })
  }
  this.agent = agent
  this.tracer = otel.trace.getTracer()
})

Given('OTel span is created with remote context as parent', function () {
  this.remoteSpanContext = {
    traceId: 'd4cda95b652f4a1592b449dd92ffda3b',
    spanId: '6e0c63ffe4e34c42',
    traceFlags: otel.TraceFlags.SAMPLED
  }
  const remoteSpan = otel.trace.wrapSpanContext(this.remoteSpanContext)
  const remoteContext = otel.trace.setSpan(otel.context.active(), remoteSpan)

  this.otelSpan = this.tracer.startSpan('aSpan', {}, remoteContext)
})

Given('OTel span is created without parent', function () {
  this.otelSpan = this.tracer.startSpan('aSpan')
})

Given('OTel span is created with local context as parent', function () {
  this.tracer.startActiveSpan('aParentSpan', aParentSpan => {
    this.localSpanContext = aParentSpan.spanContext()
    this.otelSpan = this.tracer.startSpan('aSpan')
    aParentSpan.end()
  })
})

Given('OTel span ends', function () {
  this.otelSpan.end()
})

Given('an active transaction', function (cb) {
  this.transaction = this.agent.startTransaction('aTransaction')
  console.log('XXX [xid=%d] created transaction', executionAsyncId())
  console.log('XXX created trans: %s', this.agent._instrumentation._runCtxMgr)
  cb()
})

Given('OTel span is created with kind {string}', function (kind) {
  console.log('XXX [xid=%d] OTel span is created with kind', executionAsyncId())
  console.log('XXX create span with kind: %s', this.agent._instrumentation._runCtxMgr)
  this.otelSpan = this.tracer.startSpan('aSpan', { kind })
  // this.tracer.startActiveSpan('aParentSpan', aParentSpan => {
  //   this.localSpanContext = aParentSpan.spanContext()
  //   this.otelSpan = this.tracer.startSpan('aSpan')
  //   aParentSpan.end()
  // })
})
// And OTel span is created with kind "<kind>"
// And OTel span ends
// Then Elastic bridged object is a span
// Then Elastic bridged span OTel kind is "<kind>"
// Then Elastic bridged span type is "<default_type>"
// Then Elastic bridged span subtype is "<default_subtype>"

Then('Elastic bridged object is a transaction', function () {
  assert(this.otelSpan._span instanceof Transaction, `${this.otelSpan.toString()} is a Transaction`)
})

Then('Elastic bridged transaction has remote context as parent', function () {
  assert.strictEqual(this.otelSpan._span.parentId, this.remoteSpanContext.spanId)
})

Then('Elastic bridged transaction is a root transaction', function () {
  assert.strictEqual(this.otelSpan._span.parentId, undefined)
})

Then('Elastic bridged transaction outcome is "unknown"', function () {
  assert.strictEqual(this.otelSpan._span.outcome, 'unknown')
})

Then('Elastic bridged object is a span', function () {
  assert(this.otelSpan._span instanceof Span, `${this.otelSpan.toString()} is a Span`)
})

Then('Elastic bridged span has local context as parent', function () {
  assert.strictEqual(this.otelSpan._span.parentId, this.localSpanContext.spanId)
})

Then('Elastic bridged span outcome is "unknown"', function () {
  assert.strictEqual(this.otelSpan._span.outcome, 'unknown', `${this.otelSpan.toString()} outcome is "unknown": ${this.otelSpan._span.outcome}`)
})

// # Scenario: Create span from OTel span
// #   Given an agent
// #   And OTel span is created with local context as parent
// #   And OTel span ends
// #   Then Elastic bridged object is a span
// #   Then Elastic bridged span has local context as parent
// #   # outcome should not be inferred from the lack/presence of errors
// #   Then Elastic bridged span outcome is "unknown"

// Then('I should have heard {string}', function (expectedResponse) {
//   assert.equal(this.whatIHeard, expectedResponse)
// })

After(function () {
  if (this.transaction && !this.transaction.ended) {
    this.transaction.end()
  }
})
