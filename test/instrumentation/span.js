'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')

var assert = require('../_assert')
var mockAgent = require('./_agent')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Span = require('../../lib/instrumentation/span')

var agent = mockAgent()

test('properties', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans, 'sig', 'type')
  t.ok(/^[\da-f]{16}$/.test(span.id))
  t.equal(span.transaction, trans)
  t.equal(span.name, 'sig')
  t.equal(span.type, 'type')
  t.equal(span.ended, false)
  t.end()
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

test('#setTag', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans)
    t.equal(span._tags, null)
    t.equal(span.setTag(), false)
    t.equal(span._tags, null)
    span.setTag('foo', 1)
    t.deepEqual(span._tags, { foo: '1' })
    span.setTag('bar', { baz: 2 })
    t.deepEqual(span._tags, { foo: '1', bar: '[object Object]' })
    span.setTag('foo', 3)
    t.deepEqual(span._tags, { foo: '3', bar: '[object Object]' })
    t.end()
  })

  t.test('invalid', function (t) {
    var trans = new Transaction(agent)
    var span = new Span(trans)
    t.equal(span._tags, null)
    t.equal(span.setTag(), false)
    t.equal(span._tags, null)
    span.setTag('invalid*', 1)
    t.deepEqual(span._tags, { invalid_: '1' })
    span.setTag('invalid.', 2)
    t.deepEqual(span._tags, { invalid_: '2' })
    span.setTag('invalid"', 3)
    t.deepEqual(span._tags, { invalid_: '3' })
    t.end()
  })
})

test('#addTags', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.equal(span._tags, null)

  t.equal(span.setTag(), false)
  t.equal(span._tags, null)

  span.addTags({ foo: 1 })
  t.deepEqual(span._tags, { foo: '1' })

  span.addTags({ bar: { baz: 2 } })
  t.deepEqual(span._tags, {
    foo: '1',
    bar: '[object Object]'
  })

  span.addTags({ foo: 3 })
  t.deepEqual(span._tags, {
    foo: '3',
    bar: '[object Object]'
  })

  span.addTags({ bux: 'bax', bix: 'bex' })
  t.deepEqual(span._tags, {
    foo: '3',
    bar: '[object Object]',
    bux: 'bax',
    bix: 'bex'
  })

  t.end()
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace'])
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace'])
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
  span.setTag('baz', 1)
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace'])
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
    t.deepEqual(payload.context, { db: { statement: 'foo', type: 'bar' }, tags: { baz: '1' } })
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'subtype', 'action', 'timestamp', 'duration', 'context', 'stacktrace'])
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
