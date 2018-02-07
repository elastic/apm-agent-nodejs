'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')

var assert = require('../_assert')
var mockInstrumentation = require('./_instrumentation')
var Span = require('../../lib/instrumentation/span')
var Transaction = require('../../lib/instrumentation/transaction')

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

test('span truncation', function (t) {
  var ins = mockInstrumentation(function (transaction) {
    t.equal(transaction._builtSpans.length, 20)
    for (var i = 0; i < 20; i++) {
      var span = transaction._builtSpans[i]
      t.equal(span.name, 'span ' + i)
    }
    t.end()
  })
  ins._agent._conf.transactionMaxSpans = 20

  var transaction = new Transaction(ins._agent, 'first')
  for (var i = 0; i < 100; i++) {
    var span = transaction.buildSpan()
    if (span) span.name = 'span ' + i
  }
  transaction.end()
})

test('#_encode() - un-ended', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(false)
  })
  var trans = new Transaction(ins._agent)
  trans._encode(function (err, payload) {
    t.equal(err.message, 'cannot encode un-ended transaction')
    t.end()
  })
})

test('#_encode() - ended', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'success')
    t.deepEqual(payload.context, {user: {}, tags: {}, custom: {}})
    t.deepEqual(payload.spans, [])
    t.end()
  })
})

test('#_encode() - with meta data, no spans', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent, 'foo', 'bar')
  trans.result = 'baz'
  trans.setUserContext({foo: 1})
  trans.setTag('bar', 1)
  trans.setCustomContext({baz: 1})
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'foo')
    t.equal(payload.type, 'bar')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'baz')
    t.deepEqual(payload.context, {user: {foo: 1}, tags: {bar: '1'}, custom: {baz: 1}})
    t.deepEqual(payload.spans, [])
    t.end()
  })
})

test('#_encode() - spans', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  genSpans(3)
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
    t.equal(typeof payload.id, 'string')
    t.equal(payload.id, trans.id)
    t.equal(payload.name, 'unnamed')
    t.equal(payload.type, 'custom')
    t.ok(payload.duration > 0)
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.equal(payload.result, 'success')
    t.deepEqual(payload.context, {user: {}, tags: {}, custom: {}})
    t.equal(payload.spans.length, 3)
    var start = 0
    payload.spans.forEach(function (span, index) {
      t.deepEqual(Object.keys(span), ['name', 'type', 'start', 'duration', 'stacktrace'])
      t.equal(span.name, 'span-name' + index)
      t.equal(span.type, 'span-type' + index)
      t.ok(span.start >= start)
      t.ok(span.duration > 0)
      assert.stacktrace(t, 'genSpans', __filename, span.stacktrace, ins._agent)
      start = span.start + span.duration
    })
    t.end()
  })

  function genSpans (max, n) {
    if (!n) n = 0
    var span = trans.buildSpan()
    span.start('span-name' + n, 'span-type' + n)
    span.end()
    if (++n < max) genSpans(max, n)
  }
})

test('#_encode() - http request meta data', function (t) {
  var ins = mockInstrumentation(function () {})
  var trans = new Transaction(ins._agent)
  trans.req = mockRequest()
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
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
          raw: '/foo?bar=baz',
          protocol: 'http:',
          full: 'http://example.com/foo?bar=baz'
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
    t.deepEqual(payload.spans, [])
    t.end()
  })
})

test('#_encode() - disable stack spans', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.captureSpanStackTraces = false
  var trans = new Transaction(ins._agent)
  var span = trans.buildSpan()
  span.start()
  span.end()
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
    t.equal(payload.spans.length, 1)
    t.deepEqual(Object.keys(payload.spans[0]), ['name', 'type', 'start', 'duration'])
    t.end()
  })
})

test('#_encode() - truncated spans', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.captureSpanStackTraces = false
  var trans = new Transaction(ins._agent)
  var t1 = trans.buildSpan()
  t1.start('foo')
  t1.end()
  var t2 = trans.buildSpan()
  t2.start('bar')
  trans.end()
  trans._encode(function (err, payload) {
    t.error(err)
    t.deepEqual(Object.keys(payload), ['id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'spans'])
    t.equal(payload.spans.length, 2)
    t.equal(payload.spans[0].name, 'foo')
    t.equal(payload.spans[0].type, 'custom')
    t.equal(payload.spans[1].name, 'bar')
    t.equal(payload.spans[1].type, 'custom.truncated')
    t.end()
  })
})

test('#_encode() - dropped spans', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.transactionMaxSpans = 2

  var trans = new Transaction(ins._agent, 'single-name', 'type')
  trans.result = 'result'
  var span0 = trans.buildSpan()
  span0.start('s0', 'type0')
  var span1 = trans.buildSpan()
  span1.start('s1', 'type1')
  var span2 = trans.buildSpan()
  if (span2) {
    t.fail('should have dropped the span')
  }
  span0.end()
  trans.end()

  trans._encode(function (err, payload) {
    t.error(err)

    t.equal(payload.name, 'single-name')
    t.equal(payload.type, 'type')
    t.equal(payload.result, 'result')
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.ok(payload.duration > 0, 'should have a duration >0ms')
    t.ok(payload.duration < 100, 'should have a duration <100ms')
    t.deepEqual(payload.context, {
      user: {},
      tags: {},
      custom: {}
    })

    t.equal(payload.spans.length, 2)
    t.deepEqual(payload.span_count, {
      dropped: {
        total: 1
      }
    })

    payload.spans.forEach(function (span, index) {
      t.equal(span.name, 's' + index)
      t.equal(span.type, 'type' + index + (index === 1 ? '.truncated' : ''))
      t.ok(span.start > 0, 'span start should be >0ms')
      t.ok(span.start < 100, 'span start should be <100ms')
      t.ok(span.duration > 0, 'span duration should be >0ms')
      t.ok(span.duration < 100, 'span duration should be <100ms')
    })

    t.end()
  })
})

test('#_encode() - not sampled', function (t) {
  var ins = mockInstrumentation(function () {})
  ins._agent._conf.transactionSampleRate = 0

  var trans = new Transaction(ins._agent, 'single-name', 'type')
  trans.result = 'result'
  trans.req = mockRequest()
  trans.res = mockResponse()
  var span0 = trans.buildSpan()
  if (span0) span0.start('s0', 'type0')
  trans.buildSpan()
  if (span0) span0.end()
  trans.end()

  trans._encode(function (err, payload) {
    t.error(err)
    t.equal(payload.name, 'single-name')
    t.equal(payload.type, 'type')
    t.equal(payload.result, 'result')
    t.equal(payload.timestamp, new Date(trans._timer.start).toISOString())
    t.ok(payload.duration > 0, 'should have a duration >0ms')
    t.ok(payload.duration < 100, 'should have a duration <100ms')
    t.notOk(payload.spans)
    t.notOk(payload.context)
    t.end()
  })
})

function mockRequest () {
  return {
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
}

function mockResponse () {
  var statusLine = 'HTTP/1.1 200 OK\r\n'
  var msgHeaders = 'Date: Tue, 10 Jun 2014 07:29:20 GMT\r\n' +
    'Connection: keep-alive\r\n' +
    'Transfer-Encoding: chunked\r\n' +
    'Age: foo\r\n' +
    'Age: bar\r\n' +
    'Set-Cookie: cookie\r\n' +
    'X-List: A\r\n' +
    'X-Multi-Line-Header: Foo\r\n' +
    ' Bar\r\n' +
    'X-List: B\r\n' +
    '\r\n'
  return {
    version: {major: 1, minor: 1},
    statusCode: 200,
    statusMessage: 'OK',
    headersSent: true,
    finished: true,
    _header: statusLine + msgHeaders
  }
}
