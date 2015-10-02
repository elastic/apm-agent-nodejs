'use strict'

var afterAll = require('after-all')
var test = require('tape')
var mockClient = require('./_client')

test('basic', function (t) {
  var expexted = [
    { transaction: 'foo0', signature: 't00', kind: 'type' },
    { transaction: 'foo0', signature: 't01', kind: 'type' },
    { transaction: 'foo0', signature: 'transaction', kind: 'transaction' },
    { transaction: 'foo1', signature: 't10', kind: 'type' },
    { transaction: 'foo1', signature: 't11', kind: 'type' },
    { transaction: 'foo1', signature: 'transaction', kind: 'transaction' }
  ]

  var client = mockClient(function (endpoint, data, cb) {
    var now = new Date()
    var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())

    t.equal(endpoint, 'transactions')

    t.equal(data.transactions.length, 2)

    data.transactions.forEach(function (trans, index) {
      t.equal(trans.transaction, 'foo' + index)
      t.equal(trans.kind, 'bar' + index)
      t.equal(trans.result, 'baz' + index)
      t.equal(trans.timestamp, ts.toISOString())
      t.equal(trans.durations.length, 1)
      t.ok(trans.durations.every(Number.isFinite.bind(Number)))
    })

    t.equal(data.traces.length, 6)

    data.traces.forEach(function (trace, index) {
      var trans = 0
      var rootTrans = expexted[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      if (index > 2) trans++
      t.equal(trace.transaction, expexted[index].transaction)
      t.equal(trace.signature, expexted[index].signature)
      t.equal(trace.durations.length, 1)
      t.ok(trace.durations.every(Array.isArray.bind(Array)), 'duration should be an array of arrays')
      trace.durations.every(function (arr) {
        t.ok(Number.isFinite(arr[0]))
        t.equal(arr[1], data.transactions[trans].durations[0])
      })
      if (rootTrans) {
        t.equal(trace.start_time, 0)
      } else {
        t.ok(trace.start_time > 0, 'start_time should be > 0')
        t.ok(trace.start_time < 1, 'start_time should be < 0')
      }
      t.equal(trace.kind, expexted[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.frames, []) // TODO
      t.deepEqual(trace.parents, parents)
      t.deepEqual(trace.extra, {})
    })

    t.end()
  })
  var ins = client._instrumentation

  generateTransaction(0, function () {
    generateTransaction(1, function () {
      ins._send()
    })
  })

  function generateTransaction (id, cb) {
    var trans = ins.startTransaction('foo' + id, 'bar' + id, 'baz' + id)
    var trace = trans.startTrace('t' + id + '0', 'type')

    process.nextTick(function () {
      trace.end()
      trace = trans.startTrace('t' + id + '1', 'type')
      process.nextTick(function () {
        trace.end()
        trans.end()
        cb()
      })
    })
  }
})

test('same tick', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't1')
    t.equal(data.traces[1].signature, 't0')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction', 't0'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1 = trans.startTrace('t1')
  t1.end()
  t0.end()
  trans.end()
  ins._send()
})

test('serial - no parents', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1

  process.nextTick(function () {
    t0.end()
    t1 = trans.startTrace('t1')
    process.nextTick(function () {
      t1.end()
      trans.end()
      ins._send()
    })
  })
})

test('serial - with parents', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't1')
    t.equal(data.traces[1].signature, 't0')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction', 't0'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  process.nextTick(function () {
    var t1 = trans.startTrace('t1')
    process.nextTick(function () {
      t1.end()
      t0.end()
      trans.end()
      ins._send()
    })
  })
})

test('cross stack parenting', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> transaction')

    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't1')
    t.equal(data.traces[1].signature, 't0')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0, t1

  process.nextTick(function () {
    t0 = trans.startTrace('t0')
    setTimeout(function () {
      t0.end()
      trans.end()
      ins._send()
    }, 50)
  })
  setTimeout(function () {
    t1 = trans.startTrace('t1')
    process.nextTick(function () {
      t1.end()
    })
  }, 25)
})

test('stack merging', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> transaction')

    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't1')
    t.equal(data.traces[1].signature, 't0')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0, t1

  var next = afterAll(function () {
    t1.end()
    t0.end()
    trans.end()
    ins._send()
  })
  var cb1 = next()
  var cb2 = next()

  process.nextTick(function () {
    t0 = trans.startTrace('t0')
    process.nextTick(cb1)
  })
  setTimeout(function () {
    t1 = trans.startTrace('t1')
    cb2()
  }, 25)
})

test('stack branching - no parents', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> t0 -> transaction')

    t.equal(data.traces.length, 3)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.equal(data.traces[2].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction'])
    t.deepEqual(data.traces[1].parents, ['transaction'])
    t.deepEqual(data.traces[2].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0') // 1
  var t1 = trans.startTrace('t1') // 2
  setTimeout(function () {
    t0.end() // 3
  }, 25)
  setTimeout(function () {
    t1.end() // 4
    trans.end()
    ins._send()
  }, 50)
})

test('stack branching - with parents', function (t) {
  var client = mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> t0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t2), 't2 -> t1 -> t0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t3), 't3 -> t1 -> t0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t4), 't4 -> t2 -> t1 -> t0 -> transaction')
    t.equal(pointerChain('_stackPrevStarted', t5), 't5 -> t3 -> t1 -> t0 -> transaction')

    t.equal(data.traces.length, 7)
    t.equal(data.traces[0].signature, 't4')
    t.equal(data.traces[1].signature, 't2')
    t.equal(data.traces[2].signature, 't1')
    t.equal(data.traces[3].signature, 't3')
    t.equal(data.traces[4].signature, 't5')
    t.equal(data.traces[5].signature, 't0')
    t.equal(data.traces[6].signature, 'transaction')
    t.deepEqual(data.traces[0].parents, ['transaction', 't0', 't1', 't2'])
    t.deepEqual(data.traces[1].parents, ['transaction', 't0', 't1'])
    t.deepEqual(data.traces[2].parents, ['transaction', 't0'])
    t.deepEqual(data.traces[3].parents, ['transaction', 't0'])
    t.deepEqual(data.traces[4].parents, ['transaction', 't0'])
    t.deepEqual(data.traces[5].parents, ['transaction'])
    t.deepEqual(data.traces[6].parents, [])
    t.end()
  })
  var ins = client._instrumentation

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0') // 1
  var t1 = trans.startTrace('t1') // 2
  var t2, t3, t4, t5

  process.nextTick(function () {
    t2 = trans.startTrace('t2') // 3
    setTimeout(function () {
      t4 = trans.startTrace('t4') // 5
      setTimeout(function () {
        t4.end() // 7
        t2.end() // 8
        t1.end() // 9
      }, 50)
    }, 50)
  })
  setTimeout(function () {
    t3 = trans.startTrace('t3') // 4
    setTimeout(function () {
      t5 = trans.startTrace('t5') // 6
      setTimeout(function () {
        t3.end() // 10
        t5.end() // 11
        t0.end() // 12
        trans.end()
        ins._send()
      }, 50)
    }, 50)
  }, 25)
})

function pointerChain (pointerName, trace) {
  var arr = [trace.signature]
  var prev = trace[pointerName]
  while (prev) {
    arr.push(prev.signature)
    prev = prev[pointerName]
  }
  return arr.join(' -> ')
}
