'use strict'

var test = require('tape')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')
var Span = require('../../lib/instrumentation/span')

test('init', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent, 'name', 'type')
  t.equal(trans.name, 'name')
  t.equal(trans.type, 'type')
  t.equal(trans.result, 'success')
  t.equal(trans.ended, false)
  t.deepEqual(trans.spans, [])
  t.end()
})

test('#setUserContext', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.spans.length, 1)
    t.deepEqual(trans.spans, [trans._rootSpan])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans._user, null)
  trans.setUserContext()
  t.equal(trans._user, null)
  trans.setUserContext({foo: 1})
  t.deepEqual(trans._user, {foo: 1})
  trans.setUserContext({bar: {baz: 2}})
  t.deepEqual(trans._user, {foo: 1, bar: {baz: 2}})
  trans.setUserContext({foo: 3})
  t.deepEqual(trans._user, {foo: 3, bar: {baz: 2}})
  trans.setUserContext({bar: {shallow: true}})
  t.deepEqual(trans._user, {foo: 3, bar: {shallow: true}})
  t.end()
})

test('#setCustomContext', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.spans.length, 1)
    t.deepEqual(trans.spans, [trans._rootSpan])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans._custom, null)
  trans.setCustomContext()
  t.equal(trans._custom, null)
  trans.setCustomContext({foo: 1})
  t.deepEqual(trans._custom, {foo: 1})
  trans.setCustomContext({bar: {baz: 2}})
  t.deepEqual(trans._custom, {foo: 1, bar: {baz: 2}})
  trans.setCustomContext({foo: 3})
  t.deepEqual(trans._custom, {foo: 3, bar: {baz: 2}})
  trans.setCustomContext({bar: {shallow: true}})
  t.deepEqual(trans._custom, {foo: 3, bar: {shallow: true}})
  t.end()
})

test('#setTag', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.spans.length, 1)
    t.deepEqual(trans.spans, [trans._rootSpan])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  t.equal(trans._tags, null)
  t.equal(trans.setTag(), false)
  t.equal(trans._tags, null)
  trans.setTag('foo', 1)
  t.deepEqual(trans._tags, {foo: '1'})
  trans.setTag('bar', {baz: 2})
  t.deepEqual(trans._tags, {foo: '1', bar: '[object Object]'})
  trans.setTag('foo', 3)
  t.deepEqual(trans._tags, {foo: '3', bar: '[object Object]'})
  t.end()
})

test('#end() - no spans', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.spans.length, 0)
    t.end()
  })
  var trans = new Transaction(ins._agent)
  trans.end()
})

test('#end() - with spans', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.spans.length, 1)
    t.deepEqual(trans.spans, [span])
    t.end()
  })
  var trans = new Transaction(ins._agent)
  var span = new Span(trans)
  span.start()
  span.end()
  trans.end()
})

test('#duration()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(added.duration() > 40)
    t.ok(added.duration() < 60)
    t.end()
  })
  var trans = new Transaction(ins._agent)
  setTimeout(function () {
    trans.end()
  }, 50)
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
