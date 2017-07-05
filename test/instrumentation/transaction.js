'use strict'

var test = require('tape')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Trace = require('../../lib/instrumentation/trace')

test('init', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent, 'name', 'type')
  t.equal(trans.name, 'name')
  t.equal(trans.type, 'type')
  t.equal(trans.result, 200)
  t.equal(trans.ended, false)
  t.deepEqual(trans.traces, [])
  t.end()
})

test('#setUserContext', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans._context, null)
  trans.setUserContext()
  t.equal(trans._context, null)
  trans.setUserContext({foo: 1})
  t.deepEqual(trans._context, {user: {foo: 1}})
  trans.setUserContext({bar: {baz: 2}})
  t.deepEqual(trans._context, {user: {foo: 1, bar: {baz: 2}}})
  trans.setUserContext({foo: 3})
  t.deepEqual(trans._context, {user: {foo: 3, bar: {baz: 2}}})
  trans.setUserContext({bar: {shallow: true}})
  t.deepEqual(trans._context, {user: {foo: 3, bar: {shallow: true}}})
  t.end()
})

test('#setExtraContext', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans._context, null)
  trans.setExtraContext()
  t.equal(trans._context, null)
  trans.setExtraContext({foo: 1})
  t.deepEqual(trans._context, {extra: {foo: 1}})
  trans.setExtraContext({bar: {baz: 2}})
  t.deepEqual(trans._context, {extra: {foo: 1, bar: {baz: 2}}})
  trans.setExtraContext({foo: 3})
  t.deepEqual(trans._context, {extra: {foo: 3, bar: {baz: 2}}})
  trans.setExtraContext({bar: {shallow: true}})
  t.deepEqual(trans._context, {extra: {foo: 3, bar: {shallow: true}}})
  t.end()
})

test('#setUserContext + #setExtraContext', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  trans.setUserContext({foo: 1})
  trans.setExtraContext({bar: 1})
  t.deepEqual(trans._context, {user: {foo: 1}, extra: {bar: 1}})
  t.end()
})

test('#end() - no traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 0)
    t.deepEqual(trans.traces, [])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  trans.end()
})

test('#end() - with traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trace])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  var trace = new Trace(trans)
  trace.start()
  trace.end()
  trans.end()
})

test('#duration()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(added.duration() > 24)
    t.ok(added.duration() < 35)
    t.end()
  })
  var trans = new Transaction(ins._agent)
  setTimeout(function () {
    trans.end()
  }, 25)
})

test('#duration() - un-ended transaction', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans.duration(), null)
  t.end()
})

test('#setDefaultName() - with initial value', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent, 'default-1')
  t.equal(trans.name, 'default-1')
  trans.setDefaultName('default-2')
  t.equal(trans.name, 'default-2')
  t.end()
})

test('#setDefaultName() - no initial value', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans.name, 'unnamed')
  trans.setDefaultName('default')
  t.equal(trans.name, 'default')
  t.end()
})

test('name - custom first, then default', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  trans.name = 'custom'
  trans.setDefaultName('default')
  t.equal(trans.name, 'custom')
  t.end()
})

test('name - default first, then custom', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  trans.setDefaultName('default')
  trans.name = 'custom'
  t.equal(trans.name, 'custom')
  t.end()
})

test('parallel transactions', function (t) {
  var calls = 0
  var ins = mockInstrumentation(function (added) {
    t.equal(added.traces.length, 0, added.name + ' should have 0 traces')
    t.equal(added.traces[0], added._rootTrace)

    calls++
    if (calls === 1) {
      t.equal(added.name, 'second')
    } else if (calls === 2) {
      t.equal(added.name, 'first')
      t.end()
    }
  })
  ins.currentTransaction = null

  setImmediate(function () {
    var t1 = new Transaction(ins._agent, 'first')
    setTimeout(function () {
      t1.end()
    }, 100)
  })

  setTimeout(function () {
    var t2 = new Transaction(ins._agent, 'second')
    setTimeout(function () {
      t2.end()
    }, 25)
  }, 25)
})
