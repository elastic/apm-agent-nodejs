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
  var span = new Span(trans)
  span.start('sig', 'type')
  t.equal(span.transaction, trans)
  t.equal(span.name, 'sig')
  t.equal(span.type, 'type')
  t.equal(span.ended, false)
  t.end()
})

test('#end()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start('sig', 'type')
  t.equal(span.ended, false)
  span.end()
  t.equal(span.ended, true)
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  setTimeout(function () {
    span.end()
    t.ok(span.duration() > 49, span.duration() + ' should be larger than 49')
    t.end()
  }, 50)
})

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  t.equal(span.duration(), null)
  t.end()
})

test('#offsetTime() - return null if span isn\'t started', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  t.equal(span.offsetTime(), null)
  t.end()
})

test('#offsetTime() - not return null if span is started', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  t.ok(span.offsetTime() > 0)
  t.ok(span.offsetTime() < 100)
  t.end()
})

test('#offsetTime() - sub span', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.ok(span.offsetTime() > 49, span.offsetTime() + ' should be larger than 49')
    t.end()
  })._agent)
  var span
  setTimeout(function () {
    span = new Span(trans)
    span.start()
    span.end()
    trans.end()
  }, 50)
})

test('#_encode() - un-started', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-started span')
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  span._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-ended span')
    t.end()
  })
})

test('#_encode() - ended unnamed', function myTest1 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start()
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'traceId', 'transactionId', 'timestamp', 'name', 'type', 'start', 'duration', 'stacktrace'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, span.id)
    t.equal(payload.transactionId, trans.id)
    t.equal(payload.timestamp, trans.timestamp)
    t.notOk(Number.isNaN(Date.parse(payload.timestamp)))
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.start > 0)
    t.ok(payload.duration > 0)
    assert.stacktrace(t, 'myTest1', __filename, payload.stacktrace, agent)
    t.end()
  })
})

test('#_encode() - ended named', function myTest2 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start('foo', 'bar')
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'traceId', 'transactionId', 'timestamp', 'name', 'type', 'start', 'duration', 'stacktrace'])
    t.equal(payload.transactionId, trans.id)
    t.equal(payload.timestamp, trans.timestamp)
    t.notOk(Number.isNaN(Date.parse(payload.timestamp)))
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.ok(payload.start > 0)
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
  span.start()
  span.end()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'traceId', 'transactionId', 'timestamp', 'name', 'type', 'start', 'duration'])
    t.equal(payload.transactionId, trans.id)
    t.equal(payload.timestamp, trans.timestamp)
    t.notOk(Number.isNaN(Date.parse(payload.timestamp)))
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.start > 0)
    t.ok(payload.duration > 0)
    t.end()
  })
})
