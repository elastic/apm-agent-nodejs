'use strict'

process.env.ELASTIC_APM_TEST = true

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
  t.equal(trans.result, 'success')
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
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
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
    t.equal(trans.traces.length, 1)
    t.deepEqual(trans.traces, [trans._rootTrace])
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

test('#end() - no traces', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.traces.length, 0)
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

test('#_encode() - un-ended', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  trans._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-ended trace')
    t.end()
  })
})

test('#_encode() - ended', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'success')
    t.deepEqual(payload.context, {user: {}, tags: {}, custom: {}})
    t.deepEqual(payload.traces, [])
    t.end()
  })
})

test('#_encode() - with meta data, no traces', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent, 'foo', 'bar')
  trans.result = 'baz'
  trans.setUserContext({foo: 1})
  trans.setTag('bar', 1)
  trans.setCustomContext({baz: 1})
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'baz')
    t.deepEqual(payload.context, {user: {foo: 1}, tags: {bar: '1'}, custom: {baz: 1}})
    t.deepEqual(payload.traces, [])
    t.end()
  })
})

test('#_encode() - traces', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  genTraces(3)
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'success')
    t.deepEqual(payload.context, {user: {}, tags: {}, custom: {}})
    t.equal(payload.traces.length, 3)
    var start = 0
    payload.traces.forEach(function (trace, index) {
      t.deepEqual(Object.keys(trace), ['name', 'type', 'start', 'duration', 'stacktrace'])
      t.equal(trace.name, 'trace-name' + index)
      t.equal(trace.type, 'trace-type' + index)
      t.ok(trace.start >= start)
      t.ok(trace.duration > 0)
      t.ok(trace.stacktrace.length > 0)
      t.equal(trace.stacktrace[0].function, 'genTraces')
      t.equal(trace.stacktrace[0].abs_path, __filename)
      trace.stacktrace.forEach(function (frame) {
        t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path'])
        t.equal(typeof frame.filename, 'string')
        t.ok(Number.isFinite(frame.lineno))
        t.equal(typeof frame.function, 'string')
        t.equal(typeof frame.in_app, 'boolean')
        t.equal(typeof frame.abs_path, 'string')
      })
      start = trace.start + trace.duration
    })
    t.end()
  })

  function genTraces (max, n) {
    if (!n) n = 0
    var trace = trans.buildTrace()
    trace.start('trace-name' + n, 'trace-type' + n)
    trace.end()
    if (++n < max) genTraces(max, n)
  }
})

test('#_encode() - http request meta data', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  trans.req = {
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
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'POST unknown route')
    t.equal(payload.type, 'custom')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'success')
    t.deepEqual(payload.context, {
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
    t.deepEqual(payload.traces, [])
    t.end()
  })
})

test('#_encode() - disable stack traces', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.captureTraceStackTraces = false
  var trans = new Transaction(ins._agent)
  var trace = trans.buildTrace()
  trace.start()
  trace.end()
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(payload.traces.length, 1)
    t.deepEqual(Object.keys(payload.traces[0]), ['name', 'type', 'start', 'duration'])
    t.end()
  })
})

test('#_encode() - truncated traces', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.captureTraceStackTraces = false
  var trans = new Transaction(ins._agent)
  var t1 = trans.buildTrace()
  t1.start('foo')
  t1.end()
  var t2 = trans.buildTrace()
  t2.start('bar')
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'context', 'traces'])
    t.equal(payload.traces.length, 2)
    t.equal(payload.traces[0].name, 'foo')
    t.equal(payload.traces[0].type, 'custom')
    t.equal(payload.traces[1].name, 'bar')
    t.equal(payload.traces[1].type, 'custom.truncated')
    t.end()
  })
})
