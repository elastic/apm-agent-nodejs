'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  spanFramesMinDuration: -1 // always capture stack traces with spans
})

var EventEmitter = require('events')
var http = require('http')

var test = require('tape')

var mockAgent = require('./_agent')
var mockClient = require('../_mock_http_client')
var Instrumentation = require('../../lib/instrumentation')
var findObjInArray = require('../_utils').findObjInArray

var origCaptureError = agent.captureError

test('basic', function (t) {
  resetAgent(6, function (data) {
    t.strictEqual(data.transactions.length, 2)
    t.strictEqual(data.spans.length, 4)

    data.transactions.forEach(function (trans, index) {
      t.ok(/^[\da-f]{16}$/.test(trans.id))
      t.ok(/^[\da-f]{32}$/.test(trans.trace_id))
      t.strictEqual(trans.name, 'foo' + index)
      t.strictEqual(trans.type, 'bar' + index)
      t.ok(trans.duration > 0, 'duration should be >0ms')
      t.ok(trans.duration < 100, 'duration should be <100ms')
      t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
      t.strictEqual(trans.result, 'baz' + index)

      for (let i = 0; i < 2; i++) {
        const name = 't' + index + i
        const span = findObjInArray(data.spans, 'name', name)
        t.ok(span, 'should have span named ' + name)
        t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
        t.strictEqual(span.type, 'type')
        t.ok(span.timestamp > trans.timestamp, 'assert span timestamp > transaction timestamp')
        t.ok(span.timestamp < trans.timestamp + 100000, 'assert span timestamp < transaction timestamp + 100000')
        t.ok(span.duration > 0, 'span duration should be >0ms')
        t.ok(span.duration < 100, 'span duration should be <100ms')
        t.ok(span.stacktrace.length > 0, 'should have stack trace')

        span.stacktrace.forEach(function (frame) {
          t.strictEqual(typeof frame.filename, 'string')
          t.ok(Number.isFinite(frame.lineno))
          t.strictEqual(typeof frame.function, 'string')
          t.strictEqual(typeof frame.library_frame, 'boolean')
          t.strictEqual(typeof frame.abs_path, 'string')
        })
      }
    })

    t.end()
  })
  var ins = agent._instrumentation

  generateTransaction(0, function () {
    generateTransaction(1)
  })

  function generateTransaction (id, cb) {
    var trans = ins.startTransaction('foo' + id, 'bar' + id)
    trans.result = 'baz' + id
    var span = ins.startSpan('t' + id + '0', 'type')

    process.nextTick(function () {
      span.end()
      span = ins.startSpan('t' + id + '1', 'type')
      process.nextTick(function () {
        span.end()
        trans.end()
        if (cb) cb()
      })
    })
  }
})

test('same tick', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = ins.startSpan('t0')
  var t1 = ins.startSpan('t1')
  t1.end()
  t0.end()
  trans.end()
})

test('serial - no parents', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = ins.startSpan('t0')
  process.nextTick(function () {
    t0.end()
    var t1 = ins.startSpan('t1')
    process.nextTick(function () {
      t1.end()
      trans.end()
    })
  })
})

test('serial - with parents', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = ins.startSpan('t0')
  process.nextTick(function () {
    var t1 = ins.startSpan('t1')
    process.nextTick(function () {
      t1.end()
      t0.end()
      trans.end()
    })
  })
})

test('stack branching - no parents', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = ins.startSpan('t0') // 1
  var t1 = ins.startSpan('t1') // 2
  setTimeout(function () {
    t0.end() // 3
  }, 25)
  setTimeout(function () {
    t1.end() // 4
    trans.end()
  }, 50)
})

test('currentTransaction missing - recoverable', function (t) {
  resetAgent(2, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)
    const trans = data.transactions[0]
    const name = 't0'
    const span = findObjInArray(data.spans, 'name', name)
    t.ok(span, 'should have span named ' + name)
    t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    t.end()
  })
  var ins = agent._instrumentation
  var t0

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = ins.startSpan('t0')
    ins.currentTransaction = undefined
    setImmediate(function () {
      t0.end()
      setImmediate(function () {
        ins.currentTransaction = trans
        trans.end()
      })
    })
  })
})

test('currentTransaction missing - not recoverable - last span failed', function (t) {
  resetAgent(2, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 1)
    const trans = data.transactions[0]
    const name = 't0'
    const span = findObjInArray(data.spans, 'name', name)
    t.ok(span, 'should have span named ' + name)
    t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    t.end()
  })
  var ins = agent._instrumentation
  var t0, t1

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = ins.startSpan('t0')
    setImmediate(function () {
      t0.end()
      ins.currentTransaction = undefined
      t1 = ins.startSpan('t1')
      t.strictEqual(t1, null)
      setImmediate(function () {
        ins.currentTransaction = trans
        trans.end()
      })
    })
  })
})

test('currentTransaction missing - not recoverable - middle span failed', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)
    const trans = data.transactions[0]
    const names = ['t0', 't2']
    for (const name of names) {
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.strictEqual(span.transaction_id, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation
  var t0, t1, t2

  var trans = ins.startTransaction('foo')
  setImmediate(function () {
    t0 = ins.startSpan('t0')
    setImmediate(function () {
      ins.currentTransaction = undefined
      t1 = ins.startSpan('t1')
      t.strictEqual(t1, null)
      setImmediate(function () {
        t0.end()
        t2 = ins.startSpan('t2')
        setImmediate(function () {
          t2.end()
          setImmediate(function () {
            trans.end()
          })
        })
      })
    })
  })
})

test('errors should not have a transaction id if no transaction is present', function (t) {
  resetAgent(1, function (data) {
    t.strictEqual(data.errors.length, 1)
    t.strictEqual(data.errors[0].transaction, undefined)
    t.end()
  })
  agent.captureError = origCaptureError
  agent.captureError(new Error('bar'))
})

test('errors should have a transaction id - non-ended transaction', function (t) {
  resetAgent(1, function (data) {
    t.strictEqual(data.errors.length, 1)
    t.strictEqual(data.errors[0].transaction_id, trans.id)
    t.strictEqual(typeof data.errors[0].transaction_id, 'string')
    t.end()
  })
  agent.captureError = origCaptureError
  var trans = agent.startTransaction('foo')
  agent.captureError(new Error('bar'))
})

test('errors should have a transaction id - ended transaction', function (t) {
  resetAgent(2, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.errors.length, 1)
    const trans = data.transactions[0]
    t.strictEqual(data.errors[0].transaction_id, trans.id)
    t.strictEqual(typeof data.errors[0].transaction_id, 'string')
    t.end()
  })
  agent.captureError = origCaptureError
  agent.startTransaction('foo').end()
  agent.captureError(new Error('bar'))
})

// At the time of writing, `apm.captureError(err)` will, by default, add
// properties (strings, nums, dates) found on the given `err` as
// `error.exception.attributes` in the payload sent to APM server. However, at
// the time of writing, there are no tests or docs for that behavior.
//
// Subsequently the `opts.captureAttributes` feature was added as an escape
// hatch to allow disabling that automatic capture of properties when known to
// be problematic. The intent of this test case is to test that escape hatch and
// *not* to imply the automatic additions to `error.exception.attributes` is a
// promised interface.
test('captureError should handle opts.captureAttributes', function (t) {
  resetAgent(3, function (data) {
    t.strictEqual(data.errors.length, 3)
    t.strictEqual(
      data.errors[0].exception.attributes && data.errors[0].exception.attributes.theProperty,
      'this is the property',
      'ex0 did capture attributes.theProperty')
    t.strictEqual(
      data.errors[1].exception.attributes && data.errors[1].exception.attributes.theProperty,
      'this is the property',
      'ex0 did capture attributes.theProperty')
    t.notOk(data.errors[2].exception.attributes, 'ex2 did not capture attributes')
    t.end()
  })

  agent.captureError = origCaptureError

  var ex0 = new Error('ex0')
  ex0.theProperty = 'this is the property'
  agent.captureError(ex0)

  var ex1 = new Error('ex1')
  ex1.theProperty = 'this is the property'
  agent.captureError(ex1, { captureAttributes: true })

  var ex2 = new Error('ex2')
  ex2.theProperty = 'this is the property'
  agent.captureError(ex2, { captureAttributes: false })
})

test('sampling', function (t) {
  function generateSamples (rate, count) {
    count = count || 1000
    var agent = {
      _conf: {
        transactionSampleRate: rate
      },
      logger: {
        error () {},
        warn () {},
        info () {},
        debug () {}
      }
    }
    var ins = new Instrumentation(agent)
    agent._instrumentation = ins

    var results = {
      count: count,
      sampled: 0,
      unsampled: 0
    }
    for (var i = 0; i < count; i++) {
      var trans = ins.startTransaction()
      if (trans && trans.sampled) {
        results.sampled++
      } else {
        results.unsampled++
      }
    }

    return results
  }

  function toRatios (samples) {
    return {
      count: samples.count,
      sampled: samples.sampled / samples.count,
      unsampled: samples.unsampled / samples.count
    }
  }

  var high = generateSamples(1.0)
  t.ok(high.sampled > high.unsampled)

  var low = generateSamples(0.1)
  t.ok(low.sampled < low.unsampled)

  var mid = toRatios(generateSamples(0.5))
  t.ok(mid.sampled > 0.4 && mid.sampled < 0.6)
  t.ok(mid.unsampled > 0.4 && mid.unsampled < 0.6)

  t.end()
})

test('unsampled transactions do not include spans', function (t) {
  var agent = mockAgent(1, function (data, cb) {
    t.strictEqual(data.transactions.length, 1)

    data.transactions.forEach(function (trans) {
      t.ok(/^[\da-f]{16}$/.test(trans.id))
      t.ok(/^[\da-f]{32}$/.test(trans.trace_id))
      t.ok(trans.duration > 0, 'duration should be >0ms')
      t.ok(trans.duration < 100, 'duration should be <100ms')
      t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
      t.strictEqual(trans.sampled, false)
    })

    t.end()
  })

  agent._conf.transactionSampleRate = 0.0
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var span = ins.startSpan('span 0', 'type')
  process.nextTick(function () {
    if (span) span.end()
    span = ins.startSpan('span 1', 'type')
    process.nextTick(function () {
      if (span) span.end()
      trans.end()
    })
  })
})

test('unsampled request transactions should have the correct result', function (t) {
  resetAgent(1, function (data) {
    t.strictEqual(data.transactions.length, 1)

    data.transactions.forEach(function (trans) {
      t.strictEqual(trans.sampled, false)
      t.strictEqual(trans.result, 'HTTP 2xx')
    })

    server.close()
    t.end()
  })

  agent._conf.transactionSampleRate = 0.0
  t.on('end', function () {
    agent._conf.transactionSampleRate = 1.0
  })

  var server = http.createServer(function (req, res) {
    setImmediate(function () {
      res.end()
    })
  })

  server.listen(function () {
    var port = server.address().port
    http.get('http://localhost:' + port, function (res) {
      res.resume()
    })
  })
})

test('bind', function (t) {
  t.test('does not create spans in unbound function context', function (t) {
    resetAgent(1, function (data) {
      t.strictEqual(data.transactions.length, 1)
      t.end()
    })
    var ins = agent._instrumentation

    var trans = ins.startTransaction('foo')

    function fn () {
      var t0 = ins.startSpan('t0')
      if (t0) t0.end()
      trans.end()
    }

    ins.currentTransaction = undefined
    fn()
  })

  t.test('creates spans in bound function', function (t) {
    resetAgent(2, function (data) {
      t.strictEqual(data.transactions.length, 1)
      t.strictEqual(data.spans.length, 1)
      t.strictEqual(data.spans[0].name, 't0')
      t.end()
    })
    var ins = agent._instrumentation

    var trans = ins.startTransaction('foo')

    var fn = ins.bindFunction(function () {
      var t0 = ins.startSpan('t0')
      if (t0) t0.end()
      trans.end()
    })

    ins.currentTransaction = null
    fn()
  })

  t.test('removes listeners properly', function (t) {
    resetAgent(1, function (data) {
      t.strictEqual(data.transactions.length, 1)
      t.end()
    })
    var ins = agent._instrumentation
    var trans = ins.startTransaction('foo')
    var listeners

    var emitter = new EventEmitter()
    ins.bindEmitter(emitter)

    function handler () { }

    emitter.addListener('foo', handler)
    listeners = emitter.listeners('foo')
    t.strictEqual(listeners.length, 1)
    t.notEqual(listeners[0], handler)

    emitter.removeListener('foo', handler)
    listeners = emitter.listeners('foo')
    t.strictEqual(listeners.length, 0)

    trans.end()
  })

  var methods = [
    'on',
    'once',
    'addListener',
    'prependListener',
    'prependOnceListener'
  ]

  methods.forEach(function (method) {
    t.test('does not create spans in unbound emitter with ' + method, function (t) {
      resetAgent(1, function (data) {
        t.strictEqual(data.transactions.length, 1)
        t.end()
      })
      var ins = agent._instrumentation

      var trans = ins.startTransaction('foo')

      var emitter = new EventEmitter()

      emitter[method]('foo', function () {
        var t0 = ins.startSpan('t0')
        if (t0) t0.end()
        trans.end()
      })

      ins.currentTransaction = null
      emitter.emit('foo')
    })
  })

  methods.forEach(function (method) {
    t.test('creates spans in bound emitter with ' + method, function (t) {
      resetAgent(2, function (data) {
        t.strictEqual(data.transactions.length, 1)
        t.strictEqual(data.spans.length, 1)
        t.strictEqual(data.spans[0].name, 't0')
        t.end()
      })
      var ins = agent._instrumentation

      var trans = ins.startTransaction('foo')

      var emitter = new EventEmitter()
      ins.bindEmitter(emitter)

      emitter[method]('foo', function () {
        var t0 = ins.startSpan('t0')
        if (t0) t0.end()
        trans.end()
      })

      ins.currentTransaction = null
      emitter.emit('foo')
    })
  })
})

test('nested spans', function (t) {
  resetAgent(6, function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 5)

    const trans = data.transactions[0]
    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'custom')
    t.strictEqual(trans.span_count.started, 5)

    const s0 = findObjInArray(data.spans, 'name', 's0')
    t.strictEqual(s0.parent_id, trans.id, 's0 should directly descend from the transaction')
    t.strictEqual(s0.trace_id, trans.trace_id, 's0 has same trace_id as transaction')
    t.strictEqual(s0.transaction_id, trans.id, 's0 transaction_id matches transaction id')

    const s1 = findObjInArray(data.spans, 'name', 's1')
    t.strictEqual(s1.parent_id, trans.id, 's1 should directly descend from the transaction')
    t.strictEqual(s1.trace_id, trans.trace_id, 's1 has same trace_id as transaction')
    t.strictEqual(s1.transaction_id, trans.id, 's1 transaction_id matches transaction id')

    const s01 = findObjInArray(data.spans, 'name', 's01')
    t.strictEqual(s01.parent_id, s0.id, 's01 should descend from s0')
    t.strictEqual(s01.trace_id, trans.trace_id, 's01 has same trace_id as transaction')
    t.strictEqual(s01.transaction_id, trans.id, 's01 transaction_id matches transaction id')

    const s11 = findObjInArray(data.spans, 'name', 's11')
    t.strictEqual(s11.parent_id, s1.id, 's11 should descend from s1')
    t.strictEqual(s11.trace_id, trans.trace_id, 's11 has same trace_id as transaction')
    t.strictEqual(s11.transaction_id, trans.id, 's11 transaction_id matches transaction id')

    const s12 = findObjInArray(data.spans, 'name', 's12')
    t.strictEqual(s12.parent_id, s1.id, 's12 should descend from s1')
    t.strictEqual(s12.trace_id, trans.trace_id, 's12 has same trace_id as transaction')
    t.strictEqual(s12.transaction_id, trans.id, 's12 transaction_id matches transaction id')

    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var count = 0
  function done () {
    s1.end()
    if (++count === 2) {
      trans.end()
    }
  }

  var s0 = ins.startSpan('s0')
  process.nextTick(function () {
    process.nextTick(function () {
      var s01 = ins.startSpan('s01')
      process.nextTick(function () {
        s01.end()
        done()
      })
    })
    s0.end()
  })

  var s1 = ins.startSpan('s1')
  process.nextTick(function () {
    var s11 = ins.startSpan('s11')
    process.nextTick(function () {
      s11.end()
      done()
    })
  })

  // Will adopt the t1 span as its parent,
  // because no new span has been created.
  process.nextTick(function () {
    var s12 = ins.startSpan('s12')
    process.nextTick(function () {
      s12.end()
      done()
    })
  })
})

test('nested transactions', function (t) {
  resetAgent(4, function (data) {
    t.strictEqual(data.transactions.length, 2)
    t.strictEqual(data.spans.length, 2)

    const t0 = findObjInArray(data.transactions, 'name', 't0')
    t.strictEqual(t0.type, 'custom')
    t.strictEqual(t0.span_count.started, 1)

    const s0 = findObjInArray(data.spans, 'name', 's0')
    t.strictEqual(s0.parent_id, t0.id, 's0 should directly descend from the transaction')
    t.strictEqual(s0.trace_id, t0.trace_id, 't0 has same trace_id as transaction')
    t.strictEqual(s0.transaction_id, t0.id, 't0 transaction_id matches transaction id')

    const t1 = findObjInArray(data.transactions, 'name', 't1')
    t.strictEqual(t1.type, 'custom')
    t.strictEqual(t1.span_count.started, 1)
    t.strictEqual(t1.parent_id, t0.id, 't1 should directly descend from the t0')
    t.strictEqual(t1.trace_id, t0.trace_id, 't1 has same trace_id as transaction')

    const s1 = findObjInArray(data.spans, 'name', 's1')
    t.strictEqual(s1.parent_id, t1.id, 's1 should directly descend from the transaction')
    t.strictEqual(s1.trace_id, t1.trace_id, 't1 has same trace_id as transaction')
    t.strictEqual(s1.transaction_id, t1.id, 't1 transaction_id matches transaction id')

    t.end()
  })
  var ins = agent._instrumentation

  var t0 = ins.startTransaction('t0')
  var s0 = ins.startSpan('s0')
  var t1 = ins.startTransaction('t1', null, {
    childOf: t0._context.toString()
  })
  var s1 = ins.startSpan('s1')
  s1.end()
  t1.end()
  s0.end()
  t0.end()
})

function resetAgent (expected, cb) {
  agent._conf.spanFramesMinDuration = -1
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
