'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')

var assert = require('../_assert')
var mockAgent = require('./_agent')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Span = require('../../lib/instrumentation/span')

var agent = mockAgent()

test('init', function (t) {
  t.test('properties', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans, 'sig', 'type')
    t.ok(/^[\da-f]{16}$/.test(span.id))
    t.ok(/^[\da-f]{32}$/.test(span.traceId))
    t.ok(/^[\da-f]{16}$/.test(span.parentId))
    t.ok(/^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(span.traceparent))
    t.equal(span.transaction, trans)
    t.equal(span.name, 'sig')
    t.equal(span.type, 'type')
    t.equal(span.ended, false)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = new Transaction(agent)
    var span = new Span(trans, 'sig', 'type', { childOf })
    t.equal(span._context.version, '00')
    t.equal(span._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.id, '00f067aa0ba902b7')
    t.equal(span._context.parentId, '00f067aa0ba902b7')
    t.equal(span._context.flags, '01')
    t.end()
  })
})

test('#end()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans, 'sig', 'type')
  t.equal(span.ended, false)
  span.end()
  t.equal(span.ended, true)
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
  t.equal(span.duration(), null)
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
  t.equal(span.duration(), 2000.123)
  t.end()
})

test('#setLabel', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans)
    t.equal(span._labels, null)
    t.equal(span.setLabel(), false)
    t.equal(span._labels, null)
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
    t.equal(span._labels, null)
    t.equal(span.setLabel(), false)
    t.equal(span._labels, null)
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
  t.equal(span._labels, null)

  t.equal(span.setLabel(), false)
  t.equal(span._labels, null)

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

test('sync/async tracking', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.equal(span.sync, true)
  setImmediate(() => {
    t.equal(span.sync, false)
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-ended span')
    t.end()
  })
})

test('#_encode() - ended unnamed', function myTest1 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.equal(payload.context, undefined)
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.equal(payload.context, undefined)
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.deepEqual(payload.context, { db: { statement: 'foo', type: 'bar' }, http: undefined, tags: { baz: '1' }, destination: undefined })
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - disabled stack traces', function (t) {
  var ins = mockInstrumentation()
  ins._agent._conf.captureSpanStackTraces = false
  var trans = new Transaction(ins._agent)
  var span = new Span(trans)
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace', 'sync'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.equal(payload.context, undefined)
    t.equal(payload.stacktrace, undefined)
    t.end()
  })
})

test('#ids', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.deepEqual(span.ids, {
    'trace.id': span.traceId,
    'span.id': span.id
  })
  t.end()
})

test('#toString()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.equal(span.toString(), `trace.id=${span.traceId} span.id=${span.id}`)
  t.end()
})
