'use strict'

var test = require('tape')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')

test('init', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins, 'name', 'type', 'result')
  t.equal(trans.name, 'name')
  t.equal(trans.type, 'type')
  t.equal(trans.result, 'result')
  t.equal(trans.ended, false)
  t.deepEqual(trans.traces, [])
  t.end()
})

test('#startTrace()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins)
  var trace = trans.startTrace('sig', 'type')
  t.deepEqual(trans.traces, [])
  t.equal(trace.transaction, trans)
  t.equal(trace.signature, 'sig')
  t.equal(trace.type, 'type')
  t.end()
})

test('#end() - no traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins)
  trans.end()
})

test('#end() - with traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 2)
    t.deepEqual(trans.traces, [trace, trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins)
  var trace = trans.startTrace()
  trace.end()
  trans.end()
})

test('#duration()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(added.duration() >= 25)
    t.ok(added.duration() < 35)
    t.end()
  })
  var trans = new Transaction(ins)
  setTimeout(function () {
    trans.end()
  }, 25)
})

test('#duration() - un-ended transaction', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins)
  t.equal(trans.duration(), null)
  t.end()
})
