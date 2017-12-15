'use strict'

var test = require('tape')
var mockAgent = require('./_agent')
var Transaction = require('../../lib/instrumentation/transaction')
var Trace = require('../../lib/instrumentation/trace')
var protocol = require('../../lib/instrumentation/protocol')

test('protocol.encode - empty', function (t) {
  protocol.encode([], function (err, result) {
    t.error(err)
    t.equal(result, undefined)
    t.end()
  })
})

test('protocol.encode - single transaction', function (t) {
  var agent = mockAgent()

  var t0 = new Transaction(agent, 'single-name0', 'type0')
  t0.result = 'result0'
  t0.setUserContext({foo: 1})
  t0.setCustomContext({bar: 1})
  t0.setTag('baz', 1)
  t0.end()

  protocol.encode([t0], function (err, transactions) {
    t.error(err)
    t.equal(transactions.length, 1, 'should have 1 transaction')

    transactions.forEach(function (trans, index) {
      t.ok(/[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}/.test(trans.id))
      t.equal(trans.name, 'single-name' + index)
      t.equal(trans.type, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, new Date(t0._timer.start).toISOString())
      t.ok(trans.duration > 0, 'should have a duration >0ms')
      t.ok(trans.duration < 100, 'should have a duration <100ms')
      t.deepEqual(trans.context, {
        user: {foo: 1},
        tags: {baz: '1'},
        custom: {bar: 1}
      })
      t.equal(trans.traces.length, 0)
    })

    t.end()
  })
})

test('protocol.encode - multiple transactions', function (t) {
  var agent = mockAgent()
  var samples = []

  generateTransaction(0, function () {
    generateTransaction(1, encode)
  })

  function generateTransaction (id, cb) {
    var trans = new Transaction(agent, 'name' + id, 'type' + id)
    trans.result = 'result' + id
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

        cb()
      })
    })
  }

  function encode () {
    protocol.encode(samples, function (err, transactions) {
      t.error(err)
      t.equal(transactions.length, 2, 'should have 2 transactions')

      transactions.forEach(function (trans, index) {
        t.equal(trans.name, 'name' + index)
        t.equal(trans.type, 'type' + index)
        t.equal(trans.result, 'result' + index)
        t.notOk(Number.isNaN((new Date(trans.timestamp)).getTime()))
        t.ok(trans.duration > 0, 'should have a duration >0ms')
        t.ok(trans.duration < 100, 'should have a duration <100ms')
        t.deepEqual(trans.context, {
          user: {},
          tags: {},
          custom: {}
        })

        t.equal(trans.traces.length, 2)

        trans.traces.forEach(function (trace, index2) {
          t.equal(trace.name, 't' + index + index2)
          t.equal(trace.type, 'type')
          t.ok(trace.start > 0, 'trace start should be >0ms')
          t.ok(trace.start < 100, 'trace start should be <100ms')
          t.ok(trace.duration > 0, 'trace duration should be >0ms')
          t.ok(trace.duration < 100, 'trace duration should be <100ms')
          t.ok(trace.stacktrace.length > 0, 'should have stack trace')

          trace.stacktrace.forEach(function (frame) {
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
  }
})

test('protocol.encode - http request meta data', function (t) {
  var agent = mockAgent()

  var t0 = new Transaction(agent, 'http-name0', 'type0')
  t0.result = 'result0'
  t0.req = {
    httpVersion: '1.1',
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

  protocol.encode([t0], function (err, transactions) {
    t.error(err)
    t.equal(transactions.length, 1, 'should have 1 transaction')

    transactions.forEach(function (trans, index) {
      t.equal(trans.name, 'http-name' + index)
      t.equal(trans.type, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, new Date(t0._timer.start).toISOString())
      t.ok(trans.duration > 0, 'should have a duration >0ms')
      t.ok(trans.duration < 100, 'should have a duration <100ms')
      t.deepEqual(trans.context, {
        request: {
          http_version: '1.1',
          method: 'POST',
          url: {
            hostname: 'example.com',
            pathname: '/foo',
            search: '?bar=baz',
            raw: '/foo?bar=baz'
          },
          headers: {
            host: 'example.com',
            'user-agent': 'user-agent-header',
            'content-length': 42,
            cookie: 'cookie1=foo;cookie2=bar',
            'x-bar': 'baz',
            'x-foo': 'bar'
          },
          socket: {
            remote_address: '127.0.0.1',
            encrypted: true
          },
          body: '[REDACTED]'
        },
        user: {},
        tags: {},
        custom: {}
      })
      t.equal(trans.traces.length, 0)
    })

    t.end()
  })
})

test('protocol.encode - disable stack traces', function (t) {
  var agent = mockAgent()
  agent._conf.captureTraceStackTraces = false

  var t0 = new Transaction(agent, 'single-name0', 'type0')
  t0.result = 'result0'
  var trace0 = t0.buildTrace()
  trace0.start('t00', 'type')
  trace0.end()
  t0.end()

  protocol.encode([t0], function (err, transactions) {
    t.error(err)
    t.equal(transactions.length, 1, 'should have 1 transaction')

    transactions.forEach(function (trans, index) {
      t.equal(trans.name, 'single-name' + index)
      t.equal(trans.type, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, new Date(t0._timer.start).toISOString())
      t.ok(trans.duration > 0, 'should have a duration >0ms')
      t.ok(trans.duration < 100, 'should have a duration <100ms')
      t.deepEqual(trans.context, {
        user: {},
        tags: {},
        custom: {}
      })

      t.equal(trans.traces.length, 1)

      trans.traces.forEach(function (trace, index2) {
        t.equal(trace.name, 't' + index + index2)
        t.equal(trace.type, 'type')
        t.ok(trace.start > 0, 'trace start should be >0ms')
        t.ok(trace.start < 100, 'trace start should be <100ms')
        t.ok(trace.duration > 0, 'trace duration should be >0ms')
        t.ok(trace.duration < 100, 'trace duration should be <100ms')
        t.notOk('stacktrace' in trace, 'should not have stack trace')
      })
    })

    t.end()
  })
})

test('protocol.encode - truncated traces', function (t) {
  var agent = mockAgent()
  agent._conf.captureTraceStackTraces = false

  var t0 = new Transaction(agent, 'single-name0', 'type0')
  t0.result = 'result0'
  var trace0 = t0.buildTrace()
  trace0.start('t00', 'type0')
  var trace1 = t0.buildTrace()
  trace1.start('t01', 'type1')
  t0.buildTrace()
  trace0.end()
  t0.end()

  protocol.encode([t0], function (err, transactions) {
    t.error(err)
    t.equal(transactions.length, 1, 'should have 1 transaction')

    transactions.forEach(function (trans, index) {
      t.equal(trans.name, 'single-name' + index)
      t.equal(trans.type, 'type' + index)
      t.equal(trans.result, 'result' + index)
      t.equal(trans.timestamp, new Date(t0._timer.start).toISOString())
      t.ok(trans.duration > 0, 'should have a duration >0ms')
      t.ok(trans.duration < 100, 'should have a duration <100ms')
      t.deepEqual(trans.context, {
        user: {},
        tags: {},
        custom: {}
      })

      t.equal(trans.traces.length, 2)

      trans.traces.forEach(function (trace, index2) {
        t.equal(trace.name, 't' + index + index2)
        t.equal(trace.type, 'type' + index2 + (index2 === 1 ? '.truncated' : ''))
        t.ok(trace.start > 0, 'trace start should be >0ms')
        t.ok(trace.start < 100, 'trace start should be <100ms')
        t.ok(trace.duration > 0, 'trace duration should be >0ms')
        t.ok(trace.duration < 100, 'trace duration should be <100ms')
        t.notOk('stacktrace' in trace, 'should not have stack trace')
      })
    })

    t.end()
  })
})
