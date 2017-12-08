'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')
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
  t.equal(trans.spans.indexOf(span), -1)
  span.end()
  t.equal(span.ended, true)
  t.equal(trans.spans.indexOf(span), 0)
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
    t.deepEqual(Object.keys(payload), ['name', 'type', 'start', 'duration', 'stacktrace'])
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.start > 0)
    t.ok(payload.duration > 0)
    t.ok(Array.isArray(payload.stacktrace))
    t.ok(payload.stacktrace.length > 0)
    t.equal(payload.stacktrace[0].function, 'myTest1')
    t.equal(payload.stacktrace[0].abs_path, __filename)
    payload.stacktrace.forEach(function (frame) {
      t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path'])
      t.equal(typeof frame.filename, 'string')
      t.ok(Number.isFinite(frame.lineno))
      t.equal(typeof frame.function, 'string')
      t.equal(typeof frame.in_app, 'boolean')
      t.equal(typeof frame.abs_path, 'string')
    })
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
    t.deepEqual(Object.keys(payload), ['name', 'type', 'start', 'duration', 'stacktrace'])
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.ok(payload.start > 0)
    t.ok(payload.duration > 0)
    t.ok(Array.isArray(payload.stacktrace))
    t.ok(payload.stacktrace.length > 0)
    t.equal(payload.stacktrace[0].function, 'myTest2')
    t.equal(payload.stacktrace[0].abs_path, __filename)
    payload.stacktrace.forEach(function (frame) {
      t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path'])
      t.equal(typeof frame.filename, 'string')
      t.ok(Number.isFinite(frame.lineno))
      t.equal(typeof frame.function, 'string')
      t.equal(typeof frame.in_app, 'boolean')
      t.equal(typeof frame.abs_path, 'string')
    })
    t.end()
  })
})

test('#_encode() - truncated', function myTest3 (t) {
  var trans = new Transaction(agent)
  var span = new Span(trans)
  span.start('foo', 'bar')
  span.truncate()
  span._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['name', 'type', 'start', 'duration', 'stacktrace'])
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar.truncated')
    t.ok(payload.start > 0)
    t.ok(payload.duration > 0)
    t.ok(Array.isArray(payload.stacktrace))
    t.ok(payload.stacktrace.length > 0)
    t.equal(payload.stacktrace[0].function, 'myTest3')
    t.equal(payload.stacktrace[0].abs_path, __filename)
    payload.stacktrace.forEach(function (frame) {
      t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path'])
      t.equal(typeof frame.filename, 'string')
      t.ok(Number.isFinite(frame.lineno))
      t.equal(typeof frame.function, 'string')
      t.equal(typeof frame.in_app, 'boolean')
      t.equal(typeof frame.abs_path, 'string')
    })
    t.end()
  })
})
