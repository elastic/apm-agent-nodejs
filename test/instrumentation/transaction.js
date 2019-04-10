'use strict'

process.env.ELASTIC_APM_TEST = true

var test = require('tape')

var mockAgent = require('./_agent')
var mockInstrumentation = require('./_instrumentation')
var Transaction = require('../../lib/instrumentation/transaction')

var agent = mockAgent()

test('init', function (t) {
  t.test('name and type', function (t) {
    var trans = new Transaction(agent, 'name', 'type')
    t.ok(/^[\da-f]{16}$/.test(trans.id))
    t.ok(/^[\da-f]{32}$/.test(trans.traceId))
    t.ok(/^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(trans.traceparent))
    t.equal(trans.name, 'name')
    t.equal(trans.type, 'type')
    t.equal(trans.result, 'success')
    t.equal(trans.ended, false)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = new Transaction(agent, 'name', 'type', { childOf })
    t.equal(trans._context.version, '00')
    t.equal(trans._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(trans._context.id, '00f067aa0ba902b7')
    t.equal(trans._context.parentId, '00f067aa0ba902b7')
    t.equal(trans._context.flags, '01')
    t.end()
  })
})

test('#setUserContext', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans._user, null)
  trans.setUserContext()
  t.equal(trans._user, null)
  trans.setUserContext({ foo: 1 })
  t.deepEqual(trans._user, { foo: 1 })
  trans.setUserContext({ bar: { baz: 2 } })
  t.deepEqual(trans._user, { foo: 1, bar: { baz: 2 } })
  trans.setUserContext({ foo: 3 })
  t.deepEqual(trans._user, { foo: 3, bar: { baz: 2 } })
  trans.setUserContext({ bar: { shallow: true } })
  t.deepEqual(trans._user, { foo: 3, bar: { shallow: true } })
  t.end()
})

test('#setCustomContext', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans._custom, null)
  trans.setCustomContext()
  t.equal(trans._custom, null)
  trans.setCustomContext({ foo: 1 })
  t.deepEqual(trans._custom, { foo: 1 })
  trans.setCustomContext({ bar: { baz: 2 } })
  t.deepEqual(trans._custom, { foo: 1, bar: { baz: 2 } })
  trans.setCustomContext({ foo: 3 })
  t.deepEqual(trans._custom, { foo: 3, bar: { baz: 2 } })
  trans.setCustomContext({ bar: { shallow: true } })
  t.deepEqual(trans._custom, { foo: 3, bar: { shallow: true } })
  t.end()
})

test('#setTag', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent)
    t.equal(trans._tags, null)
    t.equal(trans.setTag(), false)
    t.equal(trans._tags, null)
    trans.setTag('foo', 1)
    t.deepEqual(trans._tags, { foo: '1' })
    trans.setTag('bar', { baz: 2 })
    t.deepEqual(trans._tags, { foo: '1', bar: '[object Object]' })
    trans.setTag('foo', 3)
    t.deepEqual(trans._tags, { foo: '3', bar: '[object Object]' })
    t.end()
  })

  t.test('invalid', function (t) {
    var trans = new Transaction(agent)
    t.equal(trans._tags, null)
    t.equal(trans.setTag(), false)
    t.equal(trans._tags, null)
    trans.setTag('invalid*', 1)
    t.deepEqual(trans._tags, { invalid_: '1' })
    trans.setTag('invalid.', 2)
    t.deepEqual(trans._tags, { invalid_: '2' })
    trans.setTag('invalid"', 3)
    t.deepEqual(trans._tags, { invalid_: '3' })
    t.end()
  })
})

test('#addTags', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans._tags, null)

  t.equal(trans.setTag(), false)
  t.equal(trans._tags, null)

  trans.addTags({ foo: 1 })
  t.deepEqual(trans._tags, { foo: '1' })

  trans.addTags({ bar: { baz: 2 } })
  t.deepEqual(trans._tags, {
    foo: '1',
    bar: '[object Object]'
  })

  trans.addTags({ foo: 3 })
  t.deepEqual(trans._tags, {
    foo: '3',
    bar: '[object Object]'
  })

  trans.addTags({ bux: 'bax', bix: 'bex' })
  t.deepEqual(trans._tags, {
    foo: '3',
    bar: '[object Object]',
    bux: 'bax',
    bix: 'bex'
  })

  t.end()
})

test('#startSpan()', function (t) {
  t.test('basic', function (t) {
    var trans = new Transaction(agent)
    var span = trans.startSpan('span-name', 'span-type')
    t.ok(span, 'should return a span')
    t.equal(span.name, 'span-name')
    t.equal(span.type, 'span-type')
    t.end()
  })

  t.test('options.startTime', function (t) {
    var trans = new Transaction(agent)
    var startTime = Date.now() - 1000
    var span = trans.startSpan(null, null, { startTime })
    span.end()
    var duration = span.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var trans = new Transaction(agent)
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var span = trans.startSpan(null, null, { childOf })
    t.equal(span._context.version, '00')
    t.equal(span._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.id, '00f067aa0ba902b7')
    t.equal(span._context.parentId, '00f067aa0ba902b7')
    t.equal(span._context.flags, '01')
    t.end()
  })

  t.test('traceparent (legacy)', function (t) {
    var trans = new Transaction(agent)
    var traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var span = trans.startSpan(null, null, traceparent)
    t.equal(span._context.version, '00')
    t.equal(span._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.id, '00f067aa0ba902b7')
    t.equal(span._context.parentId, '00f067aa0ba902b7')
    t.equal(span._context.flags, '01')
    t.end()
  })
})

test('#end() - with result', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(added.ended, true)
    t.equal(added, trans)
    t.equal(trans.result, 'test')
    t.end()
  })
  var trans = new Transaction(ins._agent)
  trans.end('test')
})

test('#duration()', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.ok(added.duration() > 40)
    // TODO: Figure out why this fails on Jenkins...
    // t.ok(added.duration() < 100)
    t.end()
  })
  var trans = new Transaction(ins._agent)
  setTimeout(function () {
    trans.end()
  }, 50)
})

test('#duration() - un-ended transaction', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans.duration(), null)
  t.end()
})

test('custom start time', function (t) {
  var ins = mockInstrumentation(function (added) {
    var duration = trans.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    t.end()
  })
  var startTime = Date.now() - 1000
  var trans = new Transaction(ins._agent, null, null, { startTime })
  trans.end()
})

test('#end(time)', function (t) {
  var ins = mockInstrumentation(function (added) {
    t.equal(trans.duration(), 2000.123)
    t.end()
  })
  var startTime = Date.now() - 1000
  var endTime = startTime + 2000.123
  var trans = new Transaction(ins._agent, null, null, { startTime })
  trans.end(null, endTime)
})

test('#setDefaultName() - with initial value', function (t) {
  var trans = new Transaction(agent, 'default-1')
  t.equal(trans.name, 'default-1')
  trans.setDefaultName('default-2')
  t.equal(trans.name, 'default-2')
  t.end()
})

test('#setDefaultName() - no initial value', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans.name, 'unnamed')
  trans.setDefaultName('default')
  t.equal(trans.name, 'default')
  t.end()
})

test('name - custom first, then default', function (t) {
  var trans = new Transaction(agent)
  trans.name = 'custom'
  trans.setDefaultName('default')
  t.equal(trans.name, 'custom')
  t.end()
})

test('name - default first, then custom', function (t) {
  var trans = new Transaction(agent)
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

test('sync/async tracking', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans.sync, true)
  setImmediate(() => {
    t.equal(trans.sync, false)
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  t.equal(trans._encode(), null, 'cannot encode un-ended transaction')
  t.end()
})

test('#_encode() - ended', function (t) {
  t.plan(13)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })
  var trans = new Transaction(ins._agent)
  trans.end()
  const payload = trans._encode()
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.equal(payload.id, trans.id)
  t.equal(payload.trace_id, trans.traceId)
  t.equal(payload.parent_id, undefined)
  t.equal(payload.name, 'unnamed')
  t.equal(payload.type, 'custom')
  t.ok(payload.duration > 0)
  t.equal(payload.timestamp, trans._timer.start)
  t.equal(payload.result, 'success')
  t.deepEqual(payload.context, { user: {}, tags: {}, custom: {} })
  t.end()
})

test('#_encode() - with meta data', function (t) {
  t.plan(13)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })
  var trans = new Transaction(ins._agent, 'foo', 'bar')
  trans.result = 'baz'
  trans.setUserContext({ foo: 1 })
  trans.setTag('bar', 1)
  trans.setCustomContext({ baz: 1 })
  trans.end()
  const payload = trans._encode()
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.equal(payload.id, trans.id)
  t.equal(payload.trace_id, trans.traceId)
  t.equal(payload.parent_id, undefined)
  t.equal(payload.name, 'foo')
  t.equal(payload.type, 'bar')
  t.ok(payload.duration > 0)
  t.equal(payload.timestamp, trans._timer.start)
  t.equal(payload.result, 'baz')
  t.deepEqual(payload.context, { user: { foo: 1 }, tags: { bar: '1' }, custom: { baz: 1 } })
  t.end()
})

test('#_encode() - http request meta data', function (t) {
  t.plan(13)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })
  var trans = new Transaction(ins._agent)
  trans.req = mockRequest()
  trans.end()
  const payload = trans._encode()
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.equal(payload.id, trans.id)
  t.equal(payload.trace_id, trans.traceId)
  t.equal(payload.parent_id, undefined)
  t.equal(payload.name, 'POST unknown route')
  t.equal(payload.type, 'custom')
  t.ok(payload.duration > 0)
  t.equal(payload.timestamp, trans._timer.start)
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
  t.end()
})

test('#_encode() - with spans', function (t) {
  t.plan(9)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })

  var trans = new Transaction(ins._agent, 'single-name', 'type')
  trans.result = 'result'
  var span = trans.startSpan('span')
  span.end()
  trans.end()

  const payload = trans._encode()
  t.equal(payload.name, 'single-name')
  t.equal(payload.type, 'type')
  t.equal(payload.result, 'result')
  t.equal(payload.timestamp, trans._timer.start)
  t.ok(payload.duration > 0, 'should have a duration >0ms')
  t.ok(payload.duration < 100, 'should have a duration <100ms')
  t.deepEqual(payload.context, {
    user: {},
    tags: {},
    custom: {}
  })

  t.deepEqual(payload.span_count, {
    started: 1
  })

  t.end()
})

test('#_encode() - dropped spans', function (t) {
  t.plan(9)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })
  ins._agent._conf.transactionMaxSpans = 2

  var trans = new Transaction(ins._agent, 'single-name', 'type')
  trans.result = 'result'
  var span0 = trans.startSpan('s0', 'type0')
  trans.startSpan('s1', 'type1')
  var span2 = trans.startSpan()
  if (span2) {
    t.fail('should have dropped the span')
  }
  span0.end()
  trans.end()

  const payload = trans._encode()
  t.equal(payload.name, 'single-name')
  t.equal(payload.type, 'type')
  t.equal(payload.result, 'result')
  t.equal(payload.timestamp, trans._timer.start)
  t.ok(payload.duration > 0, 'should have a duration >0ms')
  t.ok(payload.duration < 100, 'should have a duration <100ms')
  t.deepEqual(payload.context, {
    user: {},
    tags: {},
    custom: {}
  })

  t.deepEqual(payload.span_count, {
    started: 2,
    dropped: 1
  })

  t.end()
})

test('#_encode() - not sampled', function (t) {
  t.plan(9)
  var ins = mockInstrumentation(function () {
    t.pass('should end the transaction')
  })
  ins._agent._conf.transactionSampleRate = 0

  var trans = new Transaction(ins._agent, 'single-name', 'type')
  trans.result = 'result'
  trans.req = mockRequest()
  trans.res = mockResponse()
  var span = trans.startSpan()
  t.notOk(span)
  trans.end()

  const payload = trans._encode()
  t.equal(payload.name, 'single-name')
  t.equal(payload.type, 'type')
  t.equal(payload.result, 'result')
  t.equal(payload.timestamp, trans._timer.start)
  t.ok(payload.duration > 0, 'should have a duration >0ms')
  t.ok(payload.duration < 100, 'should have a duration <100ms')
  t.notOk(payload.context)
  t.end()
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
    version: { major: 1, minor: 1 },
    statusCode: 200,
    statusMessage: 'OK',
    headersSent: true,
    finished: true,
    _header: statusLine + msgHeaders
  }
}
