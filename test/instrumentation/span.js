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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'timestamp', 'duration', 'stacktrace'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.context.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
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
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'timestamp', 'duration', 'stacktrace'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.context.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    assert.stacktrace(t, 'myTest2', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - disabled stack traces', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.captureSpanStackTraces = false
  var trans = new Transaction(ins._agent)
  var span = new Span(trans)
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'transaction_id', 'parent_id', 'trace_id', 'name', 'type', 'timestamp', 'duration'])
    t.ok(/^[\da-f]{16}$/.test(payload.id))
    t.ok(/^[\da-f]{16}$/.test(payload.transaction_id))
    t.ok(/^[\da-f]{16}$/.test(payload.parent_id))
    t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
    t.equal(payload.id, span.id)
    t.equal(payload.trace_id, span.context.traceId)
    t.equal(payload.transaction_id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.equal(payload.timestamp, span._timer.start)
    t.ok(payload.duration > 0)
    t.end()
  })
})
