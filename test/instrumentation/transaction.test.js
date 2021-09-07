'use strict'

process.env.ELASTIC_APM_TEST = true

const { CapturingTransport } = require('../_capturing_transport')
const agent = require('../..').start({
  serviceName: 'test-transaction',
  breakdownMetrics: false,
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  cloudProvider: 'none',
  spanFramesMinDuration: -1, // always capture stack traces with spans
  transport () { return new CapturingTransport() }
})

var test = require('tape')

var Transaction = require('../../lib/instrumentation/transaction')

test('init', function (t) {
  t.test('name and type', function (t) {
    var trans = new Transaction(agent, 'name', 'type')
    t.ok(/^[\da-f]{16}$/.test(trans.id))
    t.ok(/^[\da-f]{32}$/.test(trans.traceId))
    t.ok(/^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/.test(trans.traceparent))
    t.strictEqual(trans.name, 'name')
    t.strictEqual(trans.type, 'type')
    t.strictEqual(trans.result, 'success')
    t.strictEqual(trans.ended, false)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = new Transaction(agent, 'name', 'type', { childOf })
    t.strictEqual(trans._context.traceparent.version, '00')
    t.strictEqual(trans._context.traceparent.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(trans._context.traceparent.id, '00f067aa0ba902b7')
    t.strictEqual(trans._context.traceparent.parentId, '00f067aa0ba902b7')
    t.strictEqual(trans._context.traceparent.flags, '01')
    t.end()
  })
})

test('#setUserContext', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans._user, null)
  trans.setUserContext()
  t.strictEqual(trans._user, null)
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
  t.strictEqual(trans._custom, null)
  trans.setCustomContext()
  t.strictEqual(trans._custom, null)
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

test('#setLabel', function (t) {
  t.test('valid', function (t) {
    var trans = new Transaction(agent)
    t.strictEqual(trans._labels, null)
    t.strictEqual(trans.setLabel(), false)
    t.strictEqual(trans._labels, null)
    trans.setLabel('foo', 1)
    t.deepEqual(trans._labels, { foo: '1' })
    trans.setLabel('bar', { baz: 2 })
    t.deepEqual(trans._labels, { foo: '1', bar: '[object Object]' })
    trans.setLabel('foo', 3)
    t.deepEqual(trans._labels, { foo: '3', bar: '[object Object]' })
    t.end()
  })

  t.test('invalid', function (t) {
    var trans = new Transaction(agent)
    t.strictEqual(trans._labels, null)
    t.strictEqual(trans.setLabel(), false)
    t.strictEqual(trans._labels, null)
    trans.setLabel('invalid*', 1)
    t.deepEqual(trans._labels, { invalid_: '1' })
    trans.setLabel('invalid.', 2)
    t.deepEqual(trans._labels, { invalid_: '2' })
    trans.setLabel('invalid"', 3)
    t.deepEqual(trans._labels, { invalid_: '3' })
    t.end()
  })
})

test('#addLabels', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans._labels, null)

  t.strictEqual(trans.setLabel(), false)
  t.strictEqual(trans._labels, null)

  trans.addLabels({ foo: 1 })
  t.deepEqual(trans._labels, { foo: '1' })

  trans.addLabels({ bar: { baz: 2 } })
  t.deepEqual(trans._labels, {
    foo: '1',
    bar: '[object Object]'
  })

  trans.addLabels({ foo: 3 })
  t.deepEqual(trans._labels, {
    foo: '3',
    bar: '[object Object]'
  })

  trans.addLabels({ bux: 'bax', bix: 'bex' })
  t.deepEqual(trans._labels, {
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
    t.strictEqual(span.name, 'span-name')
    t.strictEqual(span.type, 'span-type')
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
    t.strictEqual(span._context.traceparent.version, '00')
    t.strictEqual(span._context.traceparent.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.traceparent.id, '00f067aa0ba902b7')
    t.strictEqual(span._context.traceparent.parentId, '00f067aa0ba902b7')
    t.strictEqual(span._context.traceparent.flags, '01')
    t.end()
  })
})

test('#end() - with result', function (t) {
  var trans = new Transaction(agent)
  trans.end('test-result')
  t.strictEqual(trans.ended, true)
  t.strictEqual(trans.result, 'test-result')

  const added = agent._transport.transactions[0]
  t.strictEqual(added.id, trans.id)
  t.strictEqual(added.result, 'test-result')

  agent._transport.clear() // clear the CapturingTransport for subsequent tests
  t.end()
})

test('#duration()', function (t) {
  var trans = new Transaction(agent)
  setTimeout(function () {
    trans.end()

    const added = agent._transport.transactions[0]
    t.ok(trans.duration() > 40)
    t.ok(added.duration > 40)
    // TODO: Figure out why this fails on Jenkins...
    // t.ok(added.duration < 100)

    agent._transport.clear()
    t.end()
  }, 50)
})

test('#duration() - un-ended transaction', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans.duration(), null)
  t.end()
})

test('custom start time', function (t) {
  var startTime = Date.now() - 1000
  var trans = new Transaction(agent, null, null, { startTime })
  trans.end()

  var duration = trans.duration()
  t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
  t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)

  agent._transport.clear()
  t.end()
})

test('#end(time)', function (t) {
  var startTime = Date.now() - 1000
  var endTime = startTime + 2000.123
  var trans = new Transaction(agent, null, null, { startTime })
  trans.end(null, endTime)

  t.strictEqual(trans.duration(), 2000.123)

  agent._transport.clear()
  t.end()
})

test('#setDefaultName() - with initial value', function (t) {
  var trans = new Transaction(agent, 'default-1')
  t.strictEqual(trans.name, 'default-1')
  trans.setDefaultName('default-2')
  t.strictEqual(trans.name, 'default-2')
  t.end()
})

test('#setDefaultName() - no initial value', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans.name, 'unnamed')
  trans.setDefaultName('default')
  t.strictEqual(trans.name, 'default')
  t.end()
})

test('name - custom first, then default', function (t) {
  var trans = new Transaction(agent)
  trans.name = 'custom'
  trans.setDefaultName('default')
  t.strictEqual(trans.name, 'custom')
  t.end()
})

test('name - default first, then custom', function (t) {
  var trans = new Transaction(agent)
  trans.setDefaultName('default')
  trans.name = 'custom'
  t.strictEqual(trans.name, 'custom')
  t.end()
})

test('parallel transactions', function (t) {
  function finish () {
    t.equal(agent._transport.transactions[0].name, 'second')
    t.equal(agent._transport.transactions[1].name, 'first')

    agent._transport.clear()
    t.end()
  }

  setImmediate(function () {
    var t1 = new Transaction(agent, 'first')
    setTimeout(function () {
      t1.end()
      finish()
    }, 100)
  })

  setTimeout(function () {
    var t2 = new Transaction(agent, 'second')
    setTimeout(function () {
      t2.end()
    }, 25)
  }, 25)
})

test('sync/async tracking', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans.sync, true)
  setImmediate(() => {
    t.strictEqual(trans.sync, false)
    t.end()
  })
})

test('#_encode() - un-ended', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans._encode(), null, 'cannot encode un-ended transaction')
  t.end()
})

test('#_encode() - ended', function (t) {
  var trans = new Transaction(agent)
  trans.end()

  const payload = agent._transport.transactions[0]
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'subtype', 'action', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count', 'outcome', 'sample_rate'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.strictEqual(payload.id, trans.id)
  t.strictEqual(payload.trace_id, trans.traceId)
  t.strictEqual(payload.parent_id, undefined)
  t.strictEqual(payload.name, 'unnamed')
  t.strictEqual(payload.type, 'custom')
  t.ok(payload.duration > 0)
  t.strictEqual(payload.timestamp, trans._timer.start)
  t.strictEqual(payload.result, 'success')
  t.deepEqual(payload.context, { user: {}, tags: {}, custom: {} })

  agent._transport.clear()
  t.end()
})

test('#_encode() - with meta data', function (t) {
  var trans = new Transaction(agent, 'foo', 'bar')
  trans.result = 'baz'
  trans.setUserContext({ foo: 1 })
  trans.setLabel('bar', 1)
  trans.setCustomContext({ baz: 1 })
  trans.end()

  const payload = agent._transport.transactions[0]
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'subtype', 'action', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count', 'outcome', 'sample_rate'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.strictEqual(payload.id, trans.id)
  t.strictEqual(payload.trace_id, trans.traceId)
  t.strictEqual(payload.parent_id, undefined)
  t.strictEqual(payload.name, 'foo')
  t.strictEqual(payload.type, 'bar')
  t.ok(payload.duration > 0)
  t.strictEqual(payload.timestamp, trans._timer.start)
  t.strictEqual(payload.result, 'baz')
  t.deepEqual(payload.context, { user: { foo: 1 }, tags: { bar: '1' }, custom: { baz: 1 } })

  agent._transport.clear()
  t.end()
})

test('#_encode() - http request meta data', function (t) {
  var trans = new Transaction(agent)
  trans.req = mockRequest()
  trans.end()

  const payload = agent._transport.transactions[0]
  t.deepEqual(Object.keys(payload), ['id', 'trace_id', 'parent_id', 'name', 'type', 'subtype', 'action', 'duration', 'timestamp', 'result', 'sampled', 'context', 'sync', 'span_count', 'outcome', 'sample_rate'])
  t.ok(/^[\da-f]{16}$/.test(payload.id))
  t.ok(/^[\da-f]{32}$/.test(payload.trace_id))
  t.strictEqual(payload.id, trans.id)
  t.strictEqual(payload.trace_id, trans.traceId)
  t.strictEqual(payload.parent_id, undefined)
  t.strictEqual(payload.name, 'POST unknown route')
  t.strictEqual(payload.type, 'custom')
  t.ok(payload.duration > 0)
  t.strictEqual(payload.timestamp, trans._timer.start)
  t.strictEqual(payload.result, 'success')
  t.deepEqual(payload.context, {
    user: {},
    tags: {},
    custom: {},
    request: {
      http_version: '1.1',
      method: 'POST',
      url: {
        raw: '/foo?bar=baz',
        protocol: 'http:',
        hostname: 'example.com',
        pathname: '/foo',
        search: '?bar=baz',
        full: 'http://example.com/foo?bar=baz'
      },
      socket: {
        remote_address: '127.0.0.1',
        encrypted: true
      },
      headers: {
        host: 'example.com',
        'user-agent': 'user-agent-header',
        'content-length': 42,
        cookie: 'cookie1=foo; cookie2=bar',
        'x-foo': 'bar',
        'x-bar': 'baz'
      },
      body: '[REDACTED]'
    }
  })

  agent._transport.clear()
  t.end()
})

test('#_encode() - with spans', function (t) {
  var trans = new Transaction(agent, 'single-name', 'type')
  trans.result = 'result'
  var span = trans.startSpan('span')
  span.end()
  trans.end()

  // Wait for span to be encoded and sent.
  setTimeout(function () {
    const payload = trans._encode()
    t.strictEqual(payload.name, 'single-name')
    t.strictEqual(payload.type, 'type')
    t.strictEqual(payload.result, 'result')
    t.strictEqual(payload.timestamp, trans._timer.start)
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

    agent._transport.clear()
    t.end()
  }, 200)
})

test('#_encode() - dropped spans', function (t) {
  const oldTransactionMaxSpans = agent._conf.transactionMaxSpans
  agent._conf.transactionMaxSpans = 2

  var trans = new Transaction(agent, 'single-name', 'type')
  trans.result = 'result'
  var span0 = trans.startSpan('s0', 'type0')
  trans.startSpan('s1', 'type1')
  var span2 = trans.startSpan()
  if (span2) {
    t.fail('should have dropped the span')
  }
  span0.end()
  trans.end()

  setTimeout(function () {
    const payload = trans._encode()
    t.strictEqual(payload.name, 'single-name')
    t.strictEqual(payload.type, 'type')
    t.strictEqual(payload.result, 'result')
    t.strictEqual(payload.timestamp, trans._timer.start)
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

    agent._conf.transactionMaxSpans = oldTransactionMaxSpans
    agent._transport.clear()
    t.end()
  }, 200)
})

test('#_encode() - not sampled', function (t) {
  const oldTransactionSampleRate = agent._conf.transactionSampleRate
  agent._conf.transactionSampleRate = 0

  var trans = new Transaction(agent, 'single-name', 'type')
  trans.result = 'result'
  trans.req = mockRequest()
  trans.res = mockResponse()
  var span = trans.startSpan()
  t.notOk(span)
  trans.end()

  const payload = trans._encode()
  t.strictEqual(payload.name, 'single-name')
  t.strictEqual(payload.type, 'type')
  t.strictEqual(payload.result, 'result')
  t.strictEqual(payload.timestamp, trans._timer.start)
  t.ok(payload.duration > 0, 'should have a duration >0ms')
  t.ok(payload.duration < 100, 'should have a duration <100ms')
  t.notOk(payload.context)

  agent._conf.transactionSampleRate = oldTransactionSampleRate
  agent._transport.clear()
  t.end()
})

test('#ids', function (t) {
  var trans = new Transaction(agent)
  t.deepLooseEqual(trans.ids, {
    'trace.id': trans.traceId,
    'transaction.id': trans.id
  })
  t.end()
})

test('#toString()', function (t) {
  var trans = new Transaction(agent)
  t.strictEqual(trans.toString(), `trace.id=${trans.traceId} transaction.id=${trans.id}`)
  t.end()
})

function mockRequest () {
  return {
    httpVersion: '1.1',
    method: 'POST',
    url: '/foo?bar=baz',
    headers: {
      host: 'example.com',
      'user-agent': 'user-agent-header',
      'content-length': 42,
      cookie: 'cookie1=foo;cookie2=bar',
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
