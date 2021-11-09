'use strict'

process.env.ELASTIC_APM_TEST = true

const { CapturingTransport } = require('../_capturing_transport')
const agent = require('../..').start({
  serviceName: 'test-span',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanFramesMinDuration: -1, // always capture stack traces with spans
  transport () { return new CapturingTransport() }
})

var test = require('tape')

var assert = require('../_assert')
var Transaction = require('../../lib/instrumentation/transaction')
var Span = require('../../lib/instrumentation/span')

test('init', function (t) {
  t.test('properties', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans, 'sig', 'type')
    t.ok(/^[\da-f]{16}$/.test(span.id))
    t.ok(/^[\da-f]{32}$/.test(span.traceId))
    t.ok(/^[\da-f]{16}$/.test(span.parentId))
    t.ok(/^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(span.traceparent))
    t.strictEqual(span.transaction, trans)
    t.strictEqual(span.name, 'sig')
    t.strictEqual(span.type, 'type')
    t.strictEqual(span.ended, false)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = new Transaction(agent)
    var span = new Span(trans, 'sig', 'type', { childOf })
    t.strictEqual(span._traceContext.traceparent.version, '00')
    t.strictEqual(span._traceContext.traceparent.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._traceContext.traceparent.id, '00f067aa0ba902b7')
    t.strictEqual(span._traceContext.traceparent.parentId, '00f067aa0ba902b7')
    t.strictEqual(span._traceContext.traceparent.flags, '01')
    t.end()
  })
})

test('#end()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans, 'sig', 'type')
  t.strictEqual(span.ended, false)
  span.end()
  t.strictEqual(span.ended, true)
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  setTimeout(function () {
    span.end()
    t.ok(span.duration() > 49, span.duration() + ' should be larger than 49')
    t.end()
  }, 50)
})

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.strictEqual(span.duration(), null)
  t.end()
})

test('custom start time', function (t) {
  var trans = new Transaction(agent)
  var startTime = Date.now() - 1000
  var span = new Span(trans, 'sig', 'type', { childOf: trans, startTime })
  span.end()
  var duration = span.duration()
  t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
  t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
  t.end()
})

test('#end(time)', function (t) {
  var trans = new Transaction(agent)
  var startTime = Date.now() - 1000
  var endTime = startTime + 2000.123
  var span = new Span(trans, 'sig', 'type', { childOf: trans, startTime })
  span.end(endTime)
  t.strictEqual(span.duration(), 2000.123)
  t.end()
})

test('#setLabel', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans)
    t.strictEqual(span._labels, null)
    t.strictEqual(span.setLabel(), false)
    t.strictEqual(span._labels, null)
    span.setLabel('foo', 1)
    t.deepEqual(span._labels, { foo: '1' })
    span.setLabel('bar', { baz: 2 })
    t.deepEqual(span._labels, { foo: '1', bar: '[object Object]' })
    span.setLabel('foo', 3)
    t.deepEqual(span._labels, { foo: '3', bar: '[object Object]' })
    t.end()
  })

  t.test('invalid', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans)
    t.strictEqual(span._labels, null)
    t.strictEqual(span.setLabel(), false)
    t.strictEqual(span._labels, null)
    span.setLabel('invalid*', 1)
    t.deepEqual(span._labels, { invalid_: '1' })
    span.setLabel('invalid.', 2)
    t.deepEqual(span._labels, { invalid_: '2' })
    span.setLabel('invalid"', 3)
    t.deepEqual(span._labels, { invalid_: '3' })
    t.end()
  })
})

test('#addLabels', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.strictEqual(span._labels, null)

  t.strictEqual(span.setLabel(), false)
  t.strictEqual(span._labels, null)

  span.addLabels({ foo: 1 })
  t.deepEqual(span._labels, { foo: '1' })

  span.addLabels({ bar: { baz: 2 } })
  t.deepEqual(span._labels, {
    foo: '1',
    bar: '[object Object]'
  })

  span.addLabels({ foo: 3 })
  t.deepEqual(span._labels, {
    foo: '3',
    bar: '[object Object]'
  })

  span.addLabels({ bux: 'bax', bix: 'bex' })
  t.deepEqual(span._labels, {
    foo: '3',
    bar: '[object Object]',
    bux: 'bax',
    bix: 'bex'
  })

  t.end()
})

test('span.sync', function (t) {
  var trans = agent.startTransaction()

  var span1 = agent.startSpan('span1')
  t.strictEqual(span1.sync, true)

  // This span will be *ended* synchronously. It should stay `span.sync=true`.
  var span2 = agent.startSpan('span2')
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after creation')
  span2.end()
  t.strictEqual(span2.sync, true, 'span2.sync=true immediately after end')

  setImmediate(() => {
    span1.end()
    t.strictEqual(span1.sync, false, 'span1.sync=false immediately after end')
    trans.end()
    t.strictEqual(span2.sync, true,
      'span2.sync=true later after having ended sync')
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span._encode(function (err, payload) {
    t.strictEqual(err.message, 'cannot encode un-ended span')
    t.end()
  })
})

test('#_encode() - ended unnamed', function myTest1 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync', 'outcome', 'sample_rate'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.strictEqual(payload.id, span.id)
    t.strictEqual(payload.trace_id, span.traceId)
    t.strictEqual(payload.transaction_id, trans.id)
    t.strictEqual(payload.name, 'unnamed')
    t.strictEqual(payload.type, 'custom')
    t.strictEqual(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.strictEqual(payload.context, undefined)
    assert.stacktrace(t, 'myTest1', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - ended named', function myTest2 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans, 'foo', 'bar')
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync', 'outcome', 'sample_rate'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.strictEqual(payload.id, span.id)
    t.strictEqual(payload.trace_id, span.traceId)
    t.strictEqual(payload.transaction_id, trans.id)
    t.strictEqual(payload.name, 'foo')
    t.strictEqual(payload.type, 'bar')
    t.strictEqual(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.strictEqual(payload.context, undefined)
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - with meta data', function myTest2 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans, 'foo', 'bar')
  span.end()
  span.setDbContext({ statement: 'foo', type: 'bar' })
  span.setLabel('baz', 1)
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync', 'outcome', 'sample_rate'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.strictEqual(payload.id, span.id)
    t.strictEqual(payload.trace_id, span.traceId)
    t.strictEqual(payload.transaction_id, trans.id)
    t.strictEqual(payload.name, 'foo')
    t.strictEqual(payload.type, 'bar')
    t.strictEqual(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.deepEqual(payload.context, { db: { statement: 'foo', type: 'bar' }, http: undefined, tags: { baz: '1' }, destination: undefined, message: undefined })
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - disabled stack traces', function (t) {
  const oldCaptureSpanStackTraces = agent._conf.captureSpanStackTraces
  agent._conf.captureSpanStackTraces = false

  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync', 'outcome', 'sample_rate'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.strictEqual(payload.id, span.id)
    t.strictEqual(payload.trace_id, span.traceId)
    t.strictEqual(payload.transaction_id, trans.id)
    t.strictEqual(payload.name, 'unnamed')
    t.strictEqual(payload.type, 'custom')
    t.strictEqual(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.strictEqual(payload.context, undefined)
    t.strictEqual(payload.stacktrace, undefined)

    agent._conf.captureSpanStackTraces = oldCaptureSpanStackTraces
    t.end()
  })
})

test('#ids', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.deepLooseEqual(span.ids, {
    'trace.id': span.traceId,
    'span.id': span.id
  })
  t.end()
})

test('#toString()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.strictEqual(span.toString(), `trace.id=${span.traceId} span.id=${span.id}`)
  t.end()
})
