'use strict'

var agent = require('../..').start({
  serviceName: 'test',
  captureExceptions: false
})

var EventEmitter = require('events')
var http = require('http')

var semver = require('semver')
var test = require('tape')

var mockAgent = require('./_agent')
var mockClient = require('../_mock_http_client')
var Instrumentation = require('../../lib/instrumentation')
var findObjInArray = require('../_utils').findObjInArray

var origCaptureError = agent.captureError

test('basic', function (t) {
  resetAgent(6, function (data) {
    t.equal(data.transactions.length, 2)
    t.equal(data.spans.length, 4)

    data.transactions.forEach(function (trans, index) {
      t.ok(/[\da-f]{16}/.test(trans.id))
      t.equal(trans.name, 'foo' + index)
      t.equal(trans.type, 'bar' + index)
      t.ok(trans.duration > 0, 'duration should be >0ms')
      t.ok(trans.duration < 100, 'duration should be <100ms')
      t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
      t.equal(trans.result, 'baz' + index)

      for (let i = 0; i < 2; i++) {
        const name = 't' + index + i
        const span = findObjInArray(data.spans, 'name', name)
        t.ok(span, 'should have span named ' + name)
        t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
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
          t.equal(typeof frame.library_frame, 'boolean')
          t.equal(typeof frame.abs_path, 'string')
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
    var span = startSpan(ins, 't' + id + '0', 'type')

    process.nextTick(function () {
      span.end()
      span = startSpan(ins, 't' + id + '1', 'type')
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
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
    }
    t.end()
  })
  var ins = agent._instrumentation

  var trans = ins.startTransaction('foo')
  var t0 = startSpan(ins, 't0')
  var t1 = startSpan(ins, 't1')
  t1.end()
  t0.end()
  trans.end()
})

test('serial - no parents', function (t) {
  resetAgent(3, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
    }
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
    })
  })
})

test('serial - with parents', function (t) {
  resetAgent(3, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
    }
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
    })
  })
})

test('stack branching - no parents', function (t) {
  resetAgent(3, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)
    const trans = data.transactions[0]
    for (let i = 0; i < 2; i++) {
      const name = 't' + i
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
    }
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
  }, 50)
})

test('currentTransaction missing - recoverable', function (t) {
  resetAgent(2, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 1)
    const trans = data.transactions[0]
    const name = 't0'
    const span = findObjInArray(data.spans, 'name', name)
    t.ok(span, 'should have span named ' + name)
    t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
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
      })
    })
  })
})

test('currentTransaction missing - not recoverable - last span failed', function (t) {
  resetAgent(2, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 1)
    const trans = data.transactions[0]
    const name = 't0'
    const span = findObjInArray(data.spans, 'name', name)
    t.ok(span, 'should have span named ' + name)
    t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
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
      })
    })
  })
})

test('currentTransaction missing - not recoverable - middle span failed', function (t) {
  resetAgent(3, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)
    const trans = data.transactions[0]
    const names = ['t0', 't2']
    for (const name of names) {
      const span = findObjInArray(data.spans, 'name', name)
      t.ok(span, 'should have span named ' + name)
      t.equal(span.transactionId, trans.id, 'should belong to correct transaction')
    }
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
          })
        })
      })
    })
  })
})

test('errors should not have a transaction id if no transaction is present', function (t) {
  resetAgent(1, function (data) {
    t.equal(data.errors.length, 1)
    t.equal(data.errors[0].transaction, undefined)
    t.end()
  })
  agent.captureError = origCaptureError
  agent.captureError(new Error('bar'))
})

test('errors should have a transaction id - non-ended transaction', function (t) {
  resetAgent(1, function (data) {
    t.equal(data.errors.length, 1)
    t.deepEqual(data.errors[0].transaction, {id: trans.id})
    t.equal(typeof data.errors[0].transaction.id, 'string')
    t.end()
  })
  agent.captureError = origCaptureError
  var trans = agent.startTransaction('foo')
  agent.captureError(new Error('bar'))
})

test('errors should have a transaction id - ended transaction', function (t) {
  resetAgent(2, function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.errors.length, 1)
    const trans = data.transactions[0]
    t.deepEqual(data.errors[0].transaction, {id: trans.id})
    t.equal(typeof data.errors[0].transaction.id, 'string')
    t.end()
  })
  agent.captureError = origCaptureError
  agent.startTransaction('foo').end()
  agent.captureError(new Error('bar'))
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
    t.equal(data.transactions.length, 1)

    data.transactions.forEach(function (trans) {
      t.ok(/[\da-f]{16}/.test(trans.id))
      t.ok(trans.duration > 0, 'duration should be >0ms')
      t.ok(trans.duration < 100, 'duration should be <100ms')
      t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
      t.equal(trans.sampled, false)
    })

    t.end()
  })

  agent._conf.transactionSampleRate = 0.0
  var ins = agent._instrumentation

  var trans = ins.startTransaction()
  var span = startSpan(ins, 'span 0', 'type')
  process.nextTick(function () {
    if (span) span.end()
    span = startSpan(ins, 'span 1', 'type')
    process.nextTick(function () {
      if (span) span.end()
      trans.end()
    })
  })
})

test('unsampled request transactions should have the correct result', function (t) {
  resetAgent(1, function (data) {
    t.equal(data.transactions.length, 1)

    data.transactions.forEach(function (trans) {
      t.equal(trans.sampled, false)
      t.equal(trans.result, 'HTTP 2xx')
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
      t.equal(data.transactions.length, 1)
      t.end()
    })
    var ins = agent._instrumentation

    var trans = ins.startTransaction('foo')

    function fn () {
      var t0 = startSpan(ins, 't0')
      if (t0) t0.end()
      trans.end()
    }

    ins.currentTransaction = undefined
    fn()
  })

  t.test('creates spans in bound function', function (t) {
    resetAgent(2, function (data) {
      t.equal(data.transactions.length, 1)
      t.equal(data.spans.length, 1)
      t.equal(data.spans[0].name, 't0')
      t.end()
    })
    var ins = agent._instrumentation

    var trans = ins.startTransaction('foo')

    var fn = ins.bindFunction(function () {
      var t0 = startSpan(ins, 't0')
      if (t0) t0.end()
      trans.end()
    })

    ins.currentTransaction = null
    fn()
  })

  var methods = [
    'on',
    'once',
    'addListener'
  ]

  if (semver.satisfies(process.versions.node, '>=6')) {
    methods.push('prependListener', 'prependOnceListener')
  }

  methods.forEach(function (method) {
    t.test('does not create spans in unbound emitter with ' + method, function (t) {
      resetAgent(1, function (data) {
        t.equal(data.transactions.length, 1)
        t.end()
      })
      var ins = agent._instrumentation

      var trans = ins.startTransaction('foo')

      var emitter = new EventEmitter()

      emitter[method]('foo', function () {
        var t0 = startSpan(ins, 't0')
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
        t.equal(data.transactions.length, 1)
        t.equal(data.spans.length, 1)
        t.equal(data.spans[0].name, 't0')
        t.end()
      })
      var ins = agent._instrumentation

      var trans = ins.startTransaction('foo')

      var emitter = new EventEmitter()
      ins.bindEmitter(emitter)

      emitter[method]('foo', function () {
        var t0 = startSpan(ins, 't0')
        if (t0) t0.end()
        trans.end()
      })

      ins.currentTransaction = null
      emitter.emit('foo')
    })
  })
})

function startSpan (ins, name, type) {
  var span = ins.buildSpan()
  if (span) span.start(name, type)
  return span
}

function resetAgent (expected, cb) {
  agent._instrumentation.currentTransaction = null
  agent._apmServer = mockClient(expected, cb)
  agent.captureError = function (err) { throw err }
}
