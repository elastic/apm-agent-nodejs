'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')
var mockAgent = require('./_agent')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Trace = require('../../lib/instrumentation/trace')

var agent = mockAgent()

test('properties', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start('sig', 'type')
  t.equal(trace.transaction, trans)
  t.equal(trace.name, 'sig')
  t.equal(trace.type, 'type')
  t.equal(trace.ended, false)
  t.end()
})

test('#end()', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start('sig', 'type')
  t.equal(trace.ended, false)
  t.equal(trans.traces.indexOf(trace), -1)
  trace.end()
  t.equal(trace.ended, true)
  t.equal(trans.traces.indexOf(trace), 0)
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  setTimeout(function () {
    trace.end()
    t.ok(trace.duration() > 49, trace.duration() + ' should be larger than 49')
    t.end()
  }, 50)
})

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  t.equal(trace.duration(), null)
  t.end()
})

test('#offsetTime() - return null if trace isn\'t started', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  t.equal(trace.offsetTime(), null)
  t.end()
})

test('#offsetTime() - not return null if trace is started', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  t.ok(trace.offsetTime() > 0)
  t.ok(trace.offsetTime() < 100)
  t.end()
})

test('#offsetTime() - sub trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.ok(trace.offsetTime() > 49, trace.offsetTime() + ' should be larger than 49')
    t.end()
  })._agent)
  var trace
  setTimeout(function () {
    trace = new Trace(trans)
    trace.start()
    trace.end()
    trans.end()
  }, 50)
})

test('#_encode() - un-started', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-started trace')
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  trace._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-ended trace')
    t.end()
  })
})

test('#_encode() - ended unnamed', function myTest1 (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  trace.end()
  trace._encode(function (err, payload) {
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
  var trace = new Trace(trans)
  trace.start('foo', 'bar')
  trace.end()
  trace._encode(function (err, payload) {
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
  var trace = new Trace(trans)
  trace.start('foo', 'bar')
  trace.truncate()
  trace._encode(function (err, payload) {
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
