'use strict'

var test = require('tape')
var mockAgent = require('./_agent')
var Transaction = require('../../lib/instrumentation/transaction')
var Trace = require('../../lib/instrumentation/trace')
var protocol = require('../../lib/instrumentation/protocol')

test('protocol.transactionGroupingKey', function (t) {
  var agent = mockAgent()
  var trans = new Transaction(agent, 'name', 'type', 'result')
  trans._start = 1477949286049
  var key = protocol.transactionGroupingKey(trans)
  t.equal(key, '1477949280000|name|result|type')
  t.end()
})

test('protocol.encode - empty', function (t) {
  var samples = []
  var durations = {}
  protocol.encode(samples, durations, function (result) {
    t.deepEqual(result, {
      transactions: [],
      traces: {
        groups: [],
        raw: []
      }
    })
    t.end()
  })
})

test('protocol.encode - single transaction', function (t) {
  var agent = mockAgent()

  var t0 = new Transaction(agent, 'single-name0', 'type0', 'result0')
  t0.end()

  var samples = [t0]
  var durations = {}

  var key = protocol.transactionGroupingKey(t0)
  durations[key] = [t0.duration()]

  protocol.encode(samples, durations, function (data) {
    var now = new Date()
    var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
    var expected = [
      { transaction: 'single-name0', signature: 'transaction', kind: 'transaction' }
    ]

    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    t.equal(data.traces.groups.length, 1, 'should have 1 group')
    t.equal(data.traces.raw.length, 1, 'should have 1 raw')

    data.transactions.forEach(function (trans, index) {
      t.equal(trans.transaction, 'single-name' + index)
      t.equal(trans.kind, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, ts.toISOString())
      t.equal(trans.durations.length, 1)
      t.ok(trans.durations.every(Number.isFinite.bind(Number)))
    })

    data.traces.groups.forEach(function (trace, index) {
      var rootTrans = expected[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      t.equal(trace.transaction, expected[index].transaction)
      t.equal(trace.signature, expected[index].signature)
      t.equal(trace.kind, expected[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.parents, parents)
    })

    data.traces.raw.forEach(function (raw, i) {
      t.equal(raw.length, 2)
      t.ok(data.transactions.some(function (trans) {
        return ~trans.durations.indexOf(raw[0])
      }), 'data.traces.raw[' + i + '][0] should be a valid transaction duration')
      t.ok(raw[1][0] in data.traces.groups, 'data.traces.raw[' + i + '][1][0] should be an index for data.traces.groups')
      raw[1].every(function (n, i2) {
        t.ok(n >= 0, 'all data.traces[' + i + '][1][' + i2 + '] >= 0')
      })
    })

    t.equal(data.traces.raw.reduce(function (total, raw) {
      return total + raw.length - 1
    }, 0), data.traces.groups.length)

    data.traces.groups.forEach(function (trace, index) {
      var rootTrans = expected[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      t.equal(trace.transaction, expected[index].transaction)
      t.equal(trace.signature, expected[index].signature)
      t.equal(trace.kind, expected[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.parents, parents)
    })

    var traceKey = function (trace) {
      return trace.kind +
        '|' + trace.signature +
        '|' + trace.transaction +
        '|' + trace.parents.join('|')
    }

    var uniqueKeys = []
    data.traces.groups.forEach(function (trace) {
      var key = traceKey(trace)
      if (uniqueKeys.indexOf(key) === -1) uniqueKeys.push(key)
    })

    var keysWithFrames = []
    data.traces.groups.forEach(function (trace) {
      if ('_frames' in trace.extra) {
        var key = traceKey(trace)
        t.ok(Array.isArray(trace.extra._frames))
        t.notOk(key in keysWithFrames)

        keysWithFrames.push(key)
      }
    })

    t.deepEqual(keysWithFrames, uniqueKeys)

    t.end()
  })
})

test('protocol.encode - multiple transactions', function (t) {
  var agent = mockAgent()
  var samples = []
  var durations = {}

  generateTransaction(0, function () {
    generateTransaction(1, encode)
  })

  function generateTransaction (id, cb) {
    var trans = new Transaction(agent, 'name' + id, 'type' + id, 'result' + id)
    var trace = new Trace(trans)
    trace.start('t' + id + '0', 'type')

    process.nextTick(function () {
      trace.end()
      trace = new Trace(trans)
      trace.start('t' + id + '1', 'type')
      process.nextTick(function () {
        trace.end()
        trans.end()

        samples.push(trans)
        var key = protocol.transactionGroupingKey(trans)
        if (key in durations) durations.push(trans.duration())
        else durations[key] = [trans.duration()]

        cb()
      })
    })
  }

  function encode () {
    protocol.encode(samples, durations, function (data) {
      var now = new Date()
      var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
      var expected = [
        { transaction: 'name0', signature: 't00', kind: 'type' },
        { transaction: 'name0', signature: 't01', kind: 'type' },
        { transaction: 'name0', signature: 'transaction', kind: 'transaction' },
        { transaction: 'name1', signature: 't10', kind: 'type' },
        { transaction: 'name1', signature: 't11', kind: 'type' },
        { transaction: 'name1', signature: 'transaction', kind: 'transaction' }
      ]

      t.equal(data.transactions.length, 2, 'should have 2 transactions')
      t.equal(data.traces.groups.length, 6, 'should have 6 group')
      t.equal(data.traces.raw.length, 2, 'should have 2 raw')

      data.transactions.forEach(function (trans, index) {
        t.equal(trans.transaction, 'name' + index)
        t.equal(trans.kind, 'type' + index)
        t.equal(trans.result, 'result' + index)
        t.equal(trans.timestamp, ts.toISOString())
        t.equal(trans.durations.length, 1)
        t.ok(trans.durations.every(Number.isFinite.bind(Number)))
      })

      data.traces.groups.forEach(function (trace, index) {
        var rootTrans = expected[index].signature === 'transaction'
        var parents = rootTrans ? [] : ['transaction']
        t.equal(trace.transaction, expected[index].transaction)
        t.equal(trace.signature, expected[index].signature)
        t.equal(trace.kind, expected[index].kind)
        t.equal(trace.timestamp, ts.toISOString())
        t.deepEqual(trace.parents, parents)
      })

      data.traces.raw.forEach(function (raw, i) {
        t.equal(raw.length, 4)
        t.ok(data.transactions.some(function (trans) {
          return ~trans.durations.indexOf(raw[0])
        }), 'data.traces.raw[' + i + '][0] should be a valid transaction duration')
        t.ok(raw[1][0] in data.traces.groups, 'data.traces.raw[' + i + '][1][0] should be an index for data.traces.groups')
        raw[1].every(function (n, i2) {
          t.ok(n >= 0, 'all data.traces[' + i + '][1][' + i2 + '] >= 0')
        })
      })

      t.equal(data.traces.raw.reduce(function (total, raw) {
        return total + raw.length - 1
      }, 0), data.traces.groups.length)

      data.traces.groups.forEach(function (trace, index) {
        var rootTrans = expected[index].signature === 'transaction'
        var parents = rootTrans ? [] : ['transaction']
        t.equal(trace.transaction, expected[index].transaction)
        t.equal(trace.signature, expected[index].signature)
        t.equal(trace.kind, expected[index].kind)
        t.equal(trace.timestamp, ts.toISOString())
        t.deepEqual(trace.parents, parents)
      })

      var traceKey = function (trace) {
        return trace.kind +
          '|' + trace.signature +
          '|' + trace.transaction +
          '|' + trace.parents.join('|')
      }

      var uniqueKeys = []
      data.traces.groups.forEach(function (trace) {
        var key = traceKey(trace)
        if (uniqueKeys.indexOf(key) === -1) uniqueKeys.push(key)
      })

      var keysWithFrames = []
      data.traces.groups.forEach(function (trace) {
        if ('_frames' in trace.extra) {
          var key = traceKey(trace)
          t.ok(Array.isArray(trace.extra._frames))
          t.notOk(key in keysWithFrames)

          keysWithFrames.push(key)
        }
      })

      t.deepEqual(keysWithFrames, uniqueKeys)

      t.end()
    })
  }
})

test('protocol.encode - http request meta data', function (t) {
  var agent = mockAgent()

  var t0 = new Transaction(agent, 'http-name0', 'type0', 'result0')
  t0.req = {
    method: 'POST',
    url: '/foo?bar=baz',
    headers: {
      'host': 'example.com',
      'user-agent': 'user-agent-header',
      'content-length': 42,
      'cookie': 'cookie1=foo;cookie2=bar',
      'x-foo': 'bar',
      'x-bar': 'baz'
    },
    socket: {
      encrypted: true,
      remoteAddress: '127.0.0.1'
    },
    body: {
      foo: 42
    }
  }
  t0.end()

  var samples = [t0]
  var durations = {}

  var key = protocol.transactionGroupingKey(t0)
  durations[key] = [t0.duration()]

  protocol.encode(samples, durations, function (data) {
    var now = new Date()
    var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
    var expected = [
      { transaction: 'http-name0', signature: 'transaction', kind: 'transaction' }
    ]

    t.equal(data.transactions.length, 1, 'should have 1 transaction')
    t.equal(data.traces.groups.length, 1, 'should have 1 group')
    t.equal(data.traces.raw.length, 1, 'should have 1 raw')

    data.transactions.forEach(function (trans, index) {
      t.equal(trans.transaction, 'http-name' + index)
      t.equal(trans.kind, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, ts.toISOString())
      t.equal(trans.durations.length, 1)
      t.ok(trans.durations.every(Number.isFinite.bind(Number)))
    })

    data.traces.groups.forEach(function (trace, index) {
      var rootTrans = expected[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      t.equal(trace.transaction, expected[index].transaction)
      t.equal(trace.signature, expected[index].signature)
      t.equal(trace.kind, expected[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.parents, parents)
    })

    data.traces.raw.forEach(function (raw, i) {
      t.equal(raw.length, 3)
      t.ok(data.transactions.some(function (trans) {
        return ~trans.durations.indexOf(raw[0])
      }), 'data.traces.raw[' + i + '][0] should be a valid transaction duration')
      t.ok(raw[1][0] in data.traces.groups, 'data.traces.raw[' + i + '][1][0] should be an index for data.traces.groups')
      raw[1].every(function (n, i2) {
        t.ok(n >= 0, 'all data.traces[' + i + '][1][' + i2 + '] >= 0')
      })
      t.deepEqual(raw[2].extra.node, process.version)
      t.deepEqual(raw[2].http, { cookies: { cookie1: 'foo', cookie2: 'bar' }, data: '[REDACTED]', headers: { host: 'example.com', 'user-agent': 'user-agent-header', 'content-length': 42, 'x-bar': 'baz', 'x-foo': 'bar' }, method: 'POST', query_string: 'bar=baz', remote_host: '127.0.0.1', secure: true, url: 'https://example.com/foo?bar=baz', user_agent: 'user-agent-header' })
    })

    t.equal(data.traces.raw.reduce(function (total, raw) {
      return total + raw.length - 2
    }, 0), data.traces.groups.length)

    data.traces.groups.forEach(function (trace, index) {
      var rootTrans = expected[index].signature === 'transaction'
      var parents = rootTrans ? [] : ['transaction']
      t.equal(trace.transaction, expected[index].transaction)
      t.equal(trace.signature, expected[index].signature)
      t.equal(trace.kind, expected[index].kind)
      t.equal(trace.timestamp, ts.toISOString())
      t.deepEqual(trace.parents, parents)
    })

    var traceKey = function (trace) {
      return trace.kind +
        '|' + trace.signature +
        '|' + trace.transaction +
        '|' + trace.parents.join('|')
    }

    var uniqueKeys = []
    data.traces.groups.forEach(function (trace) {
      var key = traceKey(trace)
      if (uniqueKeys.indexOf(key) === -1) uniqueKeys.push(key)
    })

    var keysWithFrames = []
    data.traces.groups.forEach(function (trace) {
      if ('_frames' in trace.extra) {
        var key = traceKey(trace)
        t.ok(Array.isArray(trace.extra._frames))
        t.notOk(key in keysWithFrames)

        keysWithFrames.push(key)
      }
    })

    t.deepEqual(keysWithFrames, uniqueKeys)

    t.end()
  })
})
