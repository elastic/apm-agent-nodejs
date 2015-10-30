'use strict'

var test = require('tape')
var mockClient = require('./_client')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')

var client = mockClient()

test('properties', function (t) {
  var trans = new Transaction(client)
  var trace = trans.startTrace('sig', 'type')
  t.equal(trace.transaction, trans)
  t.equal(trace.signature, 'sig')
  t.equal(trace.type, 'type')
  t.equal(trace.ended, false)
  t.end()
})

test('#end()', function (t) {
  var trans = new Transaction(client)
  var trace = trans.startTrace('sig', 'type')
  t.equal(trace.ended, false)
  t.equal(trans.traces.indexOf(trace), -1)
  trace.end()
  t.equal(trace.ended, true)
  t.equal(trans.traces.indexOf(trace), 0)
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(client)
  var trace = trans.startTrace()
  setTimeout(function () {
    trace.end()
    t.ok(trace.duration() >= 50, trace.duration() + ' should be at least 50')
    t.ok(trace.duration() < 60, trace.duration() + ' should be less than 60')
    t.end()
  }, 50)
})

test('#duration() - return null if not ended', function (t) {
  var trans = new Transaction(client)
  var trace = trans.startTrace()
  t.equal(trace.duration(), null)
  t.end()
})

test('#startTime() - return null if transaction isn\'t ended', function (t) {
  var trans = new Transaction(client)
  var trace = trans.startTrace()
  trace.end()
  t.equal(trace.startTime(), null)
  t.end()
})

test('#startTime() - root trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.equal(trans.traces[0].startTime(), 0)
    t.end()
  })._client)
  trans.end()
})

test('#startTime() - sub trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.ok(trace.startTime() >= 50, trace.startTime() + ' should be at least 50')
    t.ok(trace.startTime() < 60, trace.startTime() + ' should be less than 60')
    t.end()
  })._client)
  var trace
  setTimeout(function () {
    trace = trans.startTrace()
    trace.end()
    trans.end()
  }, 50)
})

test('#ancestors() - root trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(trans.traces[0].ancestors(), [])
    t.end()
  })._client)
  trans.end()
})

test('#ancestors() - sub trace, start/end on same tick', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(trace.ancestors(), ['transaction'])
    t.end()
  })._client)
  var trace = trans.startTrace()
  trace.end()
  trans.end()
})

test('#ancestors() - sub trace, end on next tick', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(trace.ancestors(), ['transaction'])
    t.end()
  })._client)
  var trace = trans.startTrace()
  process.nextTick(function () {
    trace.end()
    trans.end()
  })
})

test('#ancestors() - sub sub trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(t2.ancestors(), ['transaction', 'sig1'])
    t.end()
  })._client)
  var t1 = trans.startTrace('sig1')
  var t2
  process.nextTick(function () {
    t2 = trans.startTrace('sig2')
    t2.end()
    t1.end()
    trans.end()
  })
})

test('#ancestors() - parallel sub traces, start/end on same tick', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(t1.ancestors(), ['transaction'])
    t.deepEqual(t2.ancestors(), ['transaction', 'sig1a'])
    t.end()
  })._client)
  var t1 = trans.startTrace('sig1a')
  var t2 = trans.startTrace('sig1b')
  t2.end()
  t1.end()
  trans.end()
})

test('#ancestors() - parallel sub traces, end on same tick', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(t1.ancestors(), ['transaction'])
    t.deepEqual(t2.ancestors(), ['transaction', 'sig1a'])
    t.end()
  })._client)
  var t1 = trans.startTrace('sig1a')
  var t2 = trans.startTrace('sig1b')
  process.nextTick(function () {
    t2.end()
    t1.end()
    trans.end()
  })
})

test('#ancestors() - parallel sub traces, end on different ticks', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.deepEqual(t1.ancestors(), ['transaction'])
    t.deepEqual(t2.ancestors(), ['transaction', 'sig1a'])
    t.end()
  })._client)
  var t1 = trans.startTrace('sig1a')
  var t2 = trans.startTrace('sig1b')
  process.nextTick(function () {
    t2.end()
  })
  setTimeout(function () {
    t1.end()
    trans.end()
  }, 25)
})
