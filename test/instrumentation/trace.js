'use strict'

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

test('#startTime() - return null if trace isn\'t started', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  t.equal(trace.startTime(), null)
  t.end()
})

test('#startTime() - not return null if trace is started', function (t) {
  var trans = new Transaction(agent)
  var trace = new Trace(trans)
  trace.start()
  t.ok(trace.startTime() > 0)
  t.ok(trace.startTime() < 100)
  t.end()
})

test('#startTime() - sub trace', function (t) {
  var trans = new Transaction(mockInstrumentation(function () {
    t.ok(trace.startTime() > 49, trace.startTime() + ' should be larger than 49')
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
