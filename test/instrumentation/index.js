'use strict'

var afterAll = require('after-all')
var test = require('tape')
var Instrumentation = require('../../lib/instrumentation')

test('basic', function (t) {
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
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

    t.equal(data.traces.length, 4)

    data.traces.forEach(function (trace, index) {
      var trans = 0
      if (index > 1) {
        trans++
        index -= 2
      }
      t.equal(trace.transaction, 'foo' + trans)
      t.equal(trace.signature, 't' + trans + index)
      t.equal(trace.durations.length, 1)
      t.ok(trace.durations.every(Array.isArray.bind(Array)))
      trace.durations.every(function (arr) {
        t.ok(Number.isFinite(arr[0]))
        t.equal(arr[1], data.transactions[trans].durations[0])
      })
      t.ok(trace.start_time > 0)
      t.ok(trace.start_time < 1)
      t.equal(trace.kind, 'type')
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.frames, []) // TODO
      t.deepEqual(trace.parents, [])
      t.deepEqual(trace.extra, {})
    })

    t.end()
  }))

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
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, ['t0'])
    t.end()
  }))

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1 = trans.startTrace('t1')
  t1.end()
  t0.end()
  trans.end()
  ins._send()
})

test('seriel - no parents', function (t) {
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.end()
  }))

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

test('seriel - no parents', function (t) {
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.end()
  }))

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1

  process.nextTick(function () {
    t0.end()
    process.nextTick(function () {
      t1 = trans.startTrace('t1')
      process.nextTick(function () {
        t1.end()
        trans.end()
        ins._send()
      })
    })
  })
})

test('seriel - with parents', function (t) {
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(data.traces.length, 2)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, ['t0'])
    t.end()
  }))

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
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1')
    t.equal(pointerChain('_stackPrevEnded', t0), 't0')
    t.equal(pointerChain('_stackPrevEnded', t1), 't1')

    t.equal(data.traces.length, 2)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.end()
  }))

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
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1')
    t.equal(pointerChain('_stackPrevEnded', t0), 't0 -> t1')
    t.equal(pointerChain('_stackPrevEnded', t1), 't1')

    t.equal(data.traces.length, 2)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.end()
  }))

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
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> t0')
    t.equal(pointerChain('_stackPrevEnded', t0), 't0')
    t.equal(pointerChain('_stackPrevEnded', t1), 't1')

    t.equal(data.traces.length, 2)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.end()
  }))

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1 = trans.startTrace('t1')
  setTimeout(function () {
    t1.end()
  }, 25)
  setTimeout(function () {
    t0.end()
    trans.end()
    ins._send()
  }, 50)
})

test('stack branching - with parents', function (t) {
  var ins = new Instrumentation(mockClient(function (endpoint, data, cb) {
    t.equal(pointerChain('_stackPrevStarted', t0), 't0')
    t.equal(pointerChain('_stackPrevStarted', t1), 't1 -> t0')
    t.equal(pointerChain('_stackPrevStarted', t2), 't2 -> t1 -> t0')
    t.equal(pointerChain('_stackPrevStarted', t3), 't3 -> t1 -> t0')
    t.equal(pointerChain('_stackPrevStarted', t4), 't4 -> t2 -> t1 -> t0')
    t.equal(pointerChain('_stackPrevStarted', t5), 't5 -> t3 -> t1 -> t0')
    t.equal(pointerChain('_stackPrevEnded', t0), 't0 -> t5 -> t3')
    t.equal(pointerChain('_stackPrevEnded', t1), 't1 -> t2 -> t4')
    t.equal(pointerChain('_stackPrevEnded', t2), 't2 -> t4')
    t.equal(pointerChain('_stackPrevEnded', t3), 't3')
    t.equal(pointerChain('_stackPrevEnded', t4), 't4')
    t.equal(pointerChain('_stackPrevEnded', t5), 't5 -> t3')

    t.equal(data.traces.length, 6)
    t.equal(data.traces[0].signature, 't0')
    t.equal(data.traces[1].signature, 't1')
    t.equal(data.traces[2].signature, 't2')
    t.equal(data.traces[3].signature, 't3')
    t.equal(data.traces[4].signature, 't4')
    t.equal(data.traces[5].signature, 't5')
    t.deepEqual(data.traces[0].parents, [])
    t.deepEqual(data.traces[1].parents, [])
    t.deepEqual(data.traces[2].parents, ['t1'])
    t.deepEqual(data.traces[3].parents, ['t0'])
    t.deepEqual(data.traces[4].parents, ['t2', 't1'])
    t.deepEqual(data.traces[5].parents, ['t0'])
    t.end()
  }))

  var trans = ins.startTransaction()
  var t0 = trans.startTrace('t0')
  var t1 = trans.startTrace('t1')
  var t2, t3, t4, t5

  process.nextTick(function () {
    t2 = trans.startTrace('t2')
    setTimeout(function () {
      t4 = trans.startTrace('t4')
      setTimeout(function () {
        t4.end()
        t2.end()
        t1.end()
      }, 50)
    }, 50)
  })
  setTimeout(function () {
    t3 = trans.startTrace('t3')
    setTimeout(function () {
      t5 = trans.startTrace('t5')
      setTimeout(function () {
        t3.end()
        t5.end()
        t0.end()
        trans.end()
        ins._send()
      }, 50)
    }, 50)
  }, 25)
})

function mockClient (cb) {
  return {
    active: true,
    _httpClient: {
      request: cb
    }
  }
}

function pointerChain (pointerName, trace) {
  var arr = [trace.signature]
  var prev = trace[pointerName]
  while (prev) {
    arr.push(prev.signature)
    prev = prev[pointerName]
  }
  return arr.join(' -> ')
}
