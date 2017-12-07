'use strict'

var test = require('tape')
var mockAgent = require('./_agent')

test('basic', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(endpoint, 'transactions')

    t.equal(data.transactions.length, 2)

    data.transactions.forEach(function (trans, index) {
      t.ok(/[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}/.test(trans.id))
      t.equal(trans.name, 'foo' + index)
      t.equal(trans.type, 'bar' + index)
      t.ok(trans.duration > 0, 'duration should be >0ms')
      t.ok(trans.duration < 100, 'duration should be <100ms')
      t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
      t.equal(trans.result, 'baz' + index)

      t.equal(trans.spans.length, 2)

      trans.spans.forEach(function (span, index2) {
        t.equal(span.name, 't' + index + index2)
        t.equal(span.type, 'type')
        t.ok(span.start > 0, 'span start should be >0ms')
        t.ok(span.start < 100, 'span start should be <100ms')
        t.ok(span.duration > 0, 'span duration should be >0ms')
        t.ok(span.duration < 100, 'span duration should be <100ms')
        t.ok(span.stacktrace.length > 0, 'should have stack trace')

        span.stacktrace.forEach(function (frame) {
          t.equal(typeof frame.filename, 'string')
          t.ok(Number.isFinite(frame.lineno))
          t.equal(typeof frame.function, 'string')
          t.equal(typeof frame.in_app, 'boolean')
          t.equal(typeof frame.abs_path, 'string')
        })
      })
    })

    t.end()
  })
  var ins = agent._instrumentation

  generateTransaction(0, function () {
    generateTransaction(1, function () {
      ins._queue._flush()
    })
  })

  function generateTransaction (id, cb) {
    var trans = ins.startTransaction('foo' + id, 'bar' + id)
    trans.result = 'baz' + id
    var span = startSpan(ins, 't' + id + '0', 'type')

    process.nextTick(function () {
      span.end()
      span = startSpan(ins, 't' + id + '1', 'type')
      process.nextTick(function () {
        span.end()
        trans.end()
        cb()
      })
    })
  }
})

test('same tick', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 2)
    t.equal(spans[0].name, 't1')
    t.equal(spans[1].name, 't0')
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = startSpan(ins, 't0')
  var t1 = startSpan(ins, 't1')
  t1.end()
  t0.end()
  trans.end()
  ins._queue._flush()
})

test('serial - no parents', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 2)
    t.equal(spans[0].name, 't0')
    t.equal(spans[1].name, 't1')
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = startSpan(ins, 't0')
  process.nextTick(function () {
    t0.end()
    var t1 = startSpan(ins, 't1')
    process.nextTick(function () {
      t1.end()
      trans.end()
      ins._queue._flush()
    })
  })
})

test('serial - with parents', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 2)
    t.equal(spans[0].name, 't1')
    t.equal(spans[1].name, 't0')
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = startSpan(ins, 't0')
  process.nextTick(function () {
    var t1 = startSpan(ins, 't1')
    process.nextTick(function () {
      t1.end()
      t0.end()
      trans.end()
      ins._queue._flush()
    })
  })
})

test('stack branching - no parents', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 2)
    t.equal(spans[0].name, 't0')
    t.equal(spans[1].name, 't1')
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = startSpan(ins, 't0') // 1
  var t1 = startSpan(ins, 't1') // 2
  setTimeout(function () {
    t0.end() // 3
  }, 25)
  setTimeout(function () {
    t1.end() // 4
    trans.end()
    ins._queue._flush()
  }, 50)
})

test('currentTransaction missing - recoverable', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 1)
    t.equal(spans[0].name, 't0')
    t.end()
  })
  var ins = agent._instrumentation
  var t0

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = startSpan(ins, 't0')
    ins.currentTransaction = undefined
    setImmediate(function () {
      t0.end()
      setImmediate(function () {
        ins.currentTransaction = trans
        trans.end()
        ins._queue._flush()
      })
    })
  })
})

test('currentTransaction missing - not recoverable - last span failed', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 1)
    t.equal(spans[0].name, 't0')
    t.end()
  })
  var ins = agent._instrumentation
  var t0, t1

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = startSpan(ins, 't0')
    setImmediate(function () {
      t0.end()
      ins.currentTransaction = undefined
      t1 = startSpan(ins, 't1')
      t.equal(t1, null)
      setImmediate(function () {
        ins.currentTransaction = trans
        trans.end()
        ins._queue._flush()
      })
    })
  })
})

test('currentTransaction missing - not recoverable - middle span failed', function (t) {
  var agent = mockAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)
    var spans = data.transactions[0].spans
    t.equal(spans.length, 2)
    t.equal(spans[0].name, 't0')
    t.equal(spans[1].name, 't2')
    t.end()
  })
  var ins = agent._instrumentation
  var t0, t1, t2

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = startSpan(ins, 't0')
    setImmediate(function () {
      ins.currentTransaction = undefined
      t1 = startSpan(ins, 't1')
      t.equal(t1, null)
      setImmediate(function () {
        t0.end()
        t2 = startSpan(ins, 't2')
        setImmediate(function () {
          t2.end()
          setImmediate(function () {
            trans.end()
            ins._queue._flush()
          })
        })
      })
    })
  })
})

function startSpan (ins, name, type) {
  var span = ins.buildSpan()
  if (span) span.start(name, type)
  return span
}
