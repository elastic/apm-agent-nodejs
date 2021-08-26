'use strict'

// Test the public Agent API.
//
// This test file does not rely on automatic instrumentation of modules, so
// we do not need to start the agent at the top of file. Instead, tests create
// separate instances of the Agent.

var http = require('http')
var path = require('path')
var os = require('os')

var { sync: containerInfo } = require('container-info')
var test = require('tape')

const Agent = require('../lib/agent')
var config = require('../lib/config')
const { MockAPMServer } = require('./_mock_apm_server')
const { NoopTransport } = require('../lib/noop-transport')
var packageJson = require('../package.json')

var inContainer = 'containerId' in (containerInfo() || {})

// Options to pass to `agent.start()` to turn off some default agent behavior
// that is unhelpful for these tests.
const agentOpts = {
  serviceName: 'test-agent',
  centralConfig: false,
  captureExceptions: false,
  metricsInterval: '0s',
  cloudProvider: 'none',
  spanFramesMinDuration: -1, // Never discard fast spans.
  logLevel: 'warn'
}
const agentOptsNoopTransport = Object.assign(
  {},
  agentOpts,
  {
    transport: function createNoopTransport () {
      // Avoid accidentally trying to send data to an APM server.
      return new NoopTransport()
    }
  }
)

// ---- internal support functions

function assertMetadata (t, payload) {
  t.strictEqual(payload.service.name, 'test-agent')
  t.deepEqual(payload.service.runtime, { name: 'node', version: process.versions.node })
  t.deepEqual(payload.service.agent, { name: 'nodejs', version: packageJson.version })

  const expectedSystemKeys = ['hostname', 'architecture', 'platform']
  if (inContainer) expectedSystemKeys.push('container')

  t.deepEqual(Object.keys(payload.system), expectedSystemKeys)
  t.strictEqual(payload.system.hostname, os.hostname())
  t.strictEqual(payload.system.architecture, process.arch)
  t.strictEqual(payload.system.platform, process.platform)

  if (inContainer) {
    t.deepEqual(Object.keys(payload.system.container), ['id'])
    t.strictEqual(typeof payload.system.container.id, 'string')
    t.ok(/^[\da-f]{64}$/.test(payload.system.container.id))
  }

  t.ok(payload.process)
  t.strictEqual(payload.process.pid, process.pid)
  t.ok(payload.process.pid > 0, 'should have a pid greater than 0')
  t.ok(payload.process.title, 'should have a process title')
  t.strictEqual(payload.process.title, process.title)
  t.deepEqual(payload.process.argv, process.argv)
  t.ok(payload.process.argv.length >= 2, 'should have at least two process arguments')
}

function assertStackTrace (t, stacktrace) {
  t.ok(stacktrace !== undefined, 'should have a stack trace')
  t.ok(Array.isArray(stacktrace), 'stack trace should be an array')
  t.ok(stacktrace.length > 0, 'stack trace should have at least one frame')
  t.strictEqual(stacktrace[0].filename, path.join('test', 'agent.test.js'))
}

function deep (depth, n) {
  if (!n) n = 0
  if (n < depth) return deep(depth, ++n)
  return new Error()
}

// ---- tests

test('#getServiceName()', function (t) {
  const agent = new Agent()

  // Before agent.start(), config will have already been loaded once, which
  // typically means a `serviceName` determined from package.json.
  t.ok(!agent.isStarted(), 'agent should not have been started yet')
  t.strictEqual(agent.getServiceName(), packageJson.name)
  t.strictEqual(agent.getServiceName(), agent._conf.serviceName)

  // After agent.start() config will be loaded again, this time with possible
  // provided config.
  agent.start(Object.assign(
    {},
    agentOptsNoopTransport,
    { serviceName: 'myServiceName' }
  ))
  t.strictEqual(agent.getServiceName(), 'myServiceName')
  t.strictEqual(agent.getServiceName(), agent._conf.serviceName)

  agent.destroy()
  t.end()
})

test('#setFramework()', function (t) {
  // Use `agentOpts` instead of `agentOptsNoopTransport` because this test is
  // reaching into `agent._transport` internals.
  const agent = new Agent().start(agentOpts)

  t.strictEqual(agent._conf.frameworkName, undefined)
  t.strictEqual(agent._conf.frameworkVersion, undefined)
  t.strictEqual(agent._transport._conf.frameworkName, undefined)
  t.strictEqual(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({})
  t.strictEqual(agent._conf.frameworkName, undefined)
  t.strictEqual(agent._conf.frameworkVersion, undefined)
  t.strictEqual(agent._transport._conf.frameworkName, undefined)
  t.strictEqual(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({ name: 'foo' })
  t.strictEqual(agent._conf.frameworkName, 'foo')
  t.strictEqual(agent._conf.frameworkVersion, undefined)
  t.strictEqual(agent._transport._conf.frameworkName, 'foo')
  t.strictEqual(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({ version: 'bar' })
  t.strictEqual(agent._conf.frameworkName, 'foo')
  t.strictEqual(agent._conf.frameworkVersion, 'bar')
  t.strictEqual(agent._transport._conf.frameworkName, 'foo')
  t.strictEqual(agent._transport._conf.frameworkVersion, 'bar')
  agent.setFramework({ name: 'a', version: 'b' })
  t.strictEqual(agent._conf.frameworkName, 'a')
  t.strictEqual(agent._conf.frameworkVersion, 'b')
  t.strictEqual(agent._transport._conf.frameworkName, 'a')
  t.strictEqual(agent._transport._conf.frameworkVersion, 'b')
  agent.setFramework({ name: 'foo', version: 'bar', overwrite: false })
  t.strictEqual(agent._conf.frameworkName, 'a')
  t.strictEqual(agent._conf.frameworkVersion, 'b')
  t.strictEqual(agent._transport._conf.frameworkName, 'a')
  t.strictEqual(agent._transport._conf.frameworkVersion, 'b')
  agent.destroy()
  t.end()
})

test('#startTransaction()', function (t) {
  t.test('name, type, subtype and action', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction('foo', 'type', 'subtype', 'action')
    t.strictEqual(trans.name, 'foo')
    t.strictEqual(trans.type, 'type')
    t.strictEqual(trans.subtype, 'subtype')
    t.strictEqual(trans.action, 'action')
    agent.destroy()
    t.end()
  })

  t.test('options.startTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var startTime = Date.now() - 1000
    var trans = agent.startTransaction('foo', 'bar', { startTime })
    trans.end()
    var duration = trans.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    agent.destroy()
    t.end()
  })

  t.test('options.childOf', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = agent.startTransaction('foo', 'bar', { childOf })
    t.strictEqual(trans._context.traceparent.version, '00')
    t.strictEqual(trans._context.traceparent.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(trans._context.traceparent.id, '00f067aa0ba902b7')
    t.strictEqual(trans._context.traceparent.parentId, '00f067aa0ba902b7')
    t.strictEqual(trans._context.traceparent.flags, '01')
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#endTransaction()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.endTransaction()
    agent.destroy()
    t.end()
  })

  t.test('with no result', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(trans.ended, false)
    agent.endTransaction()
    t.strictEqual(trans.ended, true)
    t.strictEqual(trans.result, 'success')
    agent.destroy()
    t.end()
  })

  t.test('with explicit result', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(trans.ended, false)
    agent.endTransaction('done')
    t.strictEqual(trans.ended, true)
    t.strictEqual(trans.result, 'done')
    agent.destroy()
    t.end()
  })

  t.test('with custom endTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var startTime = Date.now() - 1000
    var endTime = startTime + 2000.123
    var trans = agent.startTransaction('foo', 'bar', { startTime })
    agent.endTransaction('done', endTime)
    t.strictEqual(trans.duration(), 2000.123)
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#currentTransaction', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.notOk(agent.currentTransaction)
    agent.destroy()
    t.end()
  })

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.currentTransaction, trans)
    agent.endTransaction()
    agent.destroy()
    t.end()
  })
})

test('#currentSpan', function (t) {
  t.test('no active or binding span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.notOk(agent.currentSpan)
    agent.destroy()
    t.end()
  })

  t.test('with binding span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    var span = agent.startSpan()
    t.strictEqual(agent.currentSpan, span)
    span.end()
    trans.end()
    agent.destroy()
    t.end()
  })

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    var span = agent.startSpan()
    process.nextTick(() => {
      t.strictEqual(agent.currentSpan, span)
      span.end()
      trans.end()
      agent.destroy()
      t.end()
    })
  })

  t.end()
})

test('#currentTraceparent', function (t) {
  t.test('no active transaction or span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.notOk(agent.currentTraceparent)
    agent.destroy()
    t.end()
  })

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.currentTraceparent, trans.traceparent)
    agent.endTransaction()
    agent.destroy()
    t.end()
  })

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.startTransaction()
    var span = agent.startSpan()
    t.strictEqual(agent.currentTraceparent, span.traceparent)
    span.end()
    agent.endTransaction()
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#currentTraceIds', function (t) {
  t.test('no active transaction or span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.deepLooseEqual(agent.currentTraceIds, {})
    t.strictEqual(agent.currentTraceIds.toString(), '')
    agent.destroy()
    t.end()
  })

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.deepLooseEqual(agent.currentTraceIds, {
      'trace.id': trans.traceId,
      'transaction.id': trans.id
    })
    t.strictEqual(agent.currentTraceIds.toString(), `trace.id=${trans.traceId} transaction.id=${trans.id}`)
    agent.endTransaction()
    agent.destroy()
    t.end()
  })

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.startTransaction()
    var span = agent.startSpan()
    t.deepLooseEqual(agent.currentTraceIds, {
      'trace.id': span.traceId,
      'span.id': span.id
    })
    t.strictEqual(agent.currentTraceIds.toString(), `trace.id=${span.traceId} span.id=${span.id}`)
    span.end()
    agent.endTransaction()
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#setTransactionName', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.doesNotThrow(function () {
      agent.setTransactionName('foo')
    })
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    agent.setTransactionName('foo')
    t.strictEqual(trans.name, 'foo')
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#startSpan()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(agent.startSpan(), null)
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.startTransaction()
    var span = agent.startSpan('span-name', 'type', 'subtype', 'action')
    t.ok(span, 'should return a span')
    t.strictEqual(span.name, 'span-name')
    t.strictEqual(span.type, 'type')
    t.strictEqual(span.subtype, 'subtype')
    t.strictEqual(span.action, 'action')
    agent.destroy()
    t.end()
  })

  t.test('options.startTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.startTransaction()
    var startTime = Date.now() - 1000
    var span = agent.startSpan('span-with-startTime', null, { startTime })
    span.end()
    var duration = span.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    agent.destroy()
    t.end()
  })

  t.test('options.childOf', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.startTransaction()
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var span = agent.startSpan(null, null, { childOf })
    t.strictEqual(span._context.traceparent.version, '00')
    t.strictEqual(span._context.traceparent.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.traceparent.id, '00f067aa0ba902b7')
    t.strictEqual(span._context.traceparent.parentId, '00f067aa0ba902b7')
    t.strictEqual(span._context.traceparent.flags, '01')
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#setUserContext()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(agent.setUserContext({ foo: 1 }), false)
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.setUserContext({ foo: 1 }), true)
    t.deepEqual(trans._user, { foo: 1 })
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#setCustomContext()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(agent.setCustomContext({ foo: 1 }), false)
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.setCustomContext({ foo: 1 }), true)
    t.deepEqual(trans._custom, { foo: 1 })
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#setLabel()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(agent.setLabel('foo', 1), false)
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.setLabel('foo', 1), true)
    t.deepEqual(trans._labels, { foo: '1' })
    agent.destroy()
    t.end()
  })

  t.test('active transaction without label stringification', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.setLabel('positive', 1, false), true)
    t.strictEqual(agent.setLabel('negative', -10, false), true)
    t.strictEqual(agent.setLabel('boolean-true', true, false), true)
    t.strictEqual(agent.setLabel('boolean-false', false, false), true)
    t.strictEqual(agent.setLabel('string', 'a custom label', false), true)
    t.deepEqual(trans._labels, {
      positive: 1,
      negative: -10,
      'boolean-true': true,
      'boolean-false': false,
      string: 'a custom label'
    })
    agent.destroy()
    t.end()
  })

  t.end()
})

test('#addLabels()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(agent.addLabels({ foo: 1 }), false)
    agent.destroy()
    t.end()
  })

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.addLabels({ foo: 1, bar: 2 }), true)
    t.strictEqual(agent.addLabels({ foo: 3 }), true)
    t.deepEqual(trans._labels, { foo: '3', bar: '2' })
    agent.destroy()
    t.end()
  })

  t.test('active transaction without label stringification', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    var trans = agent.startTransaction()
    t.strictEqual(agent.addLabels({ foo: 1, bar: true }, false), true)
    t.deepEqual(trans._labels, { foo: 1, bar: true })
    agent.destroy()
    t.end()
  })

  t.end()
})

test('filters', function (t) {
  let apmServer
  let filterAgentOpts

  t.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl)
      filterAgentOpts = Object.assign(
        {},
        agentOpts,
        { serverUrl }
      )
      t.end()
    })
  })

  t.test('#addFilter() - error', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    // Test filters are run in the order specified...
    agent.addFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo')
      t.strictEqual(++obj.context.custom.order, 1)
      return obj
    })
    // ... and that an invalid filter (not a function) is handled.
    agent.addFilter('invalid')
    agent.addFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo')
      t.strictEqual(++obj.context.custom.order, 2)
      return obj
    })

    agent.captureError(
      new Error('foo'),
      { custom: { order: 0 } },
      function (err) {
        t.error(err, 'captureError should not fail')
        t.equal(apmServer.events.length, 2, 'got 2 events')
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.ok(data, 'event 1 is an error')
        t.strictEqual(data.exception.message, 'foo')
        t.strictEqual(data.context.custom.order, 2)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('#addFilter() - transaction', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name')
      t.strictEqual(++obj.context.custom.order, 1)
      return obj
    })
    agent.addFilter('invalid')
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name')
      t.strictEqual(++obj.context.custom.order, 2)
      return obj
    })

    agent.startTransaction('transaction-name')
    agent.setCustomContext({ order: 0 })
    agent.endTransaction()
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events')
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
      assertMetadata(t, apmServer.events[0].metadata)
      const data = apmServer.events[1].transaction
      t.ok(data, 'event 1 is a transaction')
      t.strictEqual(data.name, 'transaction-name')
      t.strictEqual(data.context.custom.order, 2)

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('#addFilter() - span', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name')
      obj.order = 1
      return obj
    })
    agent.addFilter('invalid')
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name')
      t.strictEqual(++obj.order, 2)
      return obj
    })

    agent.startTransaction()
    const span = agent.startSpan('span-name')
    span.end()
    setTimeout(() => {
      agent.flush(function () {
        t.equal(apmServer.events.length, 2, 'got 2 events')
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].span
        t.ok(data, 'event 1 is a span')
        t.strictEqual(data.name, 'span-name')
        t.strictEqual(data.order, 2)

        apmServer.clear()
        agent.destroy()
        t.end()
      })
    }, 50) // Hack wait for ended span to be sent to transport.
  })

  t.test('#addErrorFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addTransactionFilter(function () {
      t.fail('should not call transaction filter')
    })
    agent.addSpanFilter(function () {
      t.fail('should not call span filter')
    })
    agent.addErrorFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo')
      t.strictEqual(++obj.context.custom.order, 1)
      return obj
    })
    agent.addErrorFilter('invalid')
    agent.addErrorFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo')
      t.strictEqual(++obj.context.custom.order, 2)
      return obj
    })

    agent.captureError(
      new Error('foo'),
      { custom: { order: 0 } },
      function (err) {
        t.error(err, 'captureError should not fail')
        t.equal(apmServer.events.length, 2, 'got 2 events')
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.ok(data, 'event 1 is an error')
        t.strictEqual(data.exception.message, 'foo')
        t.strictEqual(data.context.custom.order, 2)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('#addTransactionFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addErrorFilter(function () {
      t.fail('should not call error filter')
    })
    agent.addSpanFilter(function () {
      t.fail('should not call span filter')
    })
    agent.addTransactionFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name')
      t.strictEqual(++obj.context.custom.order, 1)
      return obj
    })
    agent.addTransactionFilter('invalid')
    agent.addTransactionFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name')
      t.strictEqual(++obj.context.custom.order, 2)
      return obj
    })

    agent.startTransaction('transaction-name')
    agent.setCustomContext({ order: 0 })
    agent.endTransaction()
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events')
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
      assertMetadata(t, apmServer.events[0].metadata)
      const data = apmServer.events[1].transaction
      t.ok(data, 'event 1 is a transaction')
      t.strictEqual(data.name, 'transaction-name')
      t.strictEqual(data.context.custom.order, 2)

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('#addSpanFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addErrorFilter(function () {
      t.fail('should not call error filter')
    })
    agent.addTransactionFilter(function () {
      t.fail('should not call transaction filter')
    })
    agent.addSpanFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name')
      obj.order = 1
      return obj
    })
    agent.addSpanFilter('invalid')
    agent.addSpanFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name')
      t.strictEqual(++obj.order, 2)
      return obj
    })

    agent.startTransaction()
    const span = agent.startSpan('span-name')
    span.end()
    setTimeout(() => {
      agent.flush(function () {
        t.equal(apmServer.events.length, 2, 'got 2 events')
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].span
        t.ok(data, 'event 1 is a span')
        t.strictEqual(data.name, 'span-name')
        t.strictEqual(data.order, 2)

        apmServer.clear()
        agent.destroy()
        t.end()
      })
    }, 50) // Hack wait for ended span to be sent to transport.
  })

  t.test('#addMetadataFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts)
    agent.addErrorFilter(function () {
      t.fail('should not call error filter')
    })
    agent.addSpanFilter(function () {
      t.fail('should not call span filter')
    })
    agent.addMetadataFilter(function (obj) {
      t.strictEqual(obj.service.agent.name, 'nodejs')
      obj.order = 1
      return obj
    })
    agent.addMetadataFilter('invalid')
    agent.addMetadataFilter(function (obj) {
      t.strictEqual(obj.service.agent.name, 'nodejs')
      t.strictEqual(++obj.order, 2)
      return obj
    })

    agent.startTransaction('transaction-name')
    agent.endTransaction()
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events')
      const data = apmServer.events[0].metadata
      t.ok(data, 'event 0 is metadata')
      assertMetadata(t, data)
      t.strictEqual(data.service.agent.name, 'nodejs')
      t.strictEqual(data.order, 2)

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  const falsyValues = [undefined, null, false, 0, '', NaN]
  falsyValues.forEach(falsy => {
    t.test(`#addFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false
      const agent = new Agent().start(filterAgentOpts)
      agent.addFilter(function (obj) {
        calledFirstFilter = true
        return falsy
      })
      agent.addFilter(function () {
        t.fail('should not call 2nd filter')
      })
      agent.captureError(new Error('foo'), function () {
        t.ok(calledFirstFilter, 'called first filter')
        t.equal(apmServer.requests.length, 0, 'APM server did not receive a request')
        apmServer.clear()
        agent.destroy()
        t.end()
      })
    })

    t.test(`#addErrorFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false
      const agent = new Agent().start(filterAgentOpts)
      agent.addErrorFilter(function (obj) {
        calledFirstFilter = true
        return falsy
      })
      agent.addErrorFilter(function () {
        t.fail('should not call 2nd filter')
      })
      agent.captureError(new Error('foo'), function () {
        t.ok(calledFirstFilter, 'called first filter')
        t.equal(apmServer.requests.length, 0, 'APM server did not receive a request')
        apmServer.clear()
        agent.destroy()
        t.end()
      })
    })

    t.test(`#addTransactionFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false
      const agent = new Agent().start(filterAgentOpts)
      agent.addTransactionFilter(function (obj) {
        calledFirstFilter = true
        return falsy
      })
      agent.addTransactionFilter(function () {
        t.fail('should not call 2nd filter')
      })
      agent.startTransaction('transaction-name')
      agent.endTransaction()
      agent.flush(function () {
        t.ok(calledFirstFilter, 'called first filter')
        t.equal(apmServer.requests.length, 0, 'APM server did not receive a request')
        apmServer.clear()
        agent.destroy()
        t.end()
      })
    })

    t.test(`#addSpanFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false
      const agent = new Agent().start(filterAgentOpts)
      agent.addSpanFilter(function (obj) {
        calledFirstFilter = true
        return falsy
      })
      agent.addSpanFilter(function () {
        t.fail('should not call 2nd filter')
      })
      agent.startTransaction()
      const span = agent.startSpan('span-name')
      span.end()
      setTimeout(function () {
        agent.flush(function () {
          t.ok(calledFirstFilter, 'called first filter')
          t.equal(apmServer.requests.length, 0, 'APM server did not receive a request')
          apmServer.clear()
          agent.destroy()
          t.end()
        })
      }, 50) // Hack wait for ended span to be sent to transport.
    })
  })

  t.test('teardown mock APM server', function (t) {
    apmServer.close()
    t.end()
  })

  t.end()
})

test('#flush()', function (t) {
  t.test('start not called', function (t) {
    t.plan(2)
    const agent = new Agent()
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback')
      t.pass('should call flush callback even if agent.start() wasn\'t called')
      agent.destroy()
      t.end()
    })
  })

  t.test('start called, but agent inactive', function (t) {
    t.plan(2)
    const agent = new Agent().start({ active: false })
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback')
      t.pass('should call flush callback even if agent is inactive')
      agent.destroy()
      t.end()
    })
  })

  t.test('agent started, but no data in the queue', function (t) {
    t.plan(2)
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback')
      t.pass('should call flush callback even if there\'s nothing to flush')
      agent.destroy()
      t.end()
    })
  })

  t.test('flush with agent started, and data in the queue', function (t) {
    const apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(Object.assign(
        {},
        agentOpts,
        { serverUrl }
      ))
      agent.startTransaction('foo')
      agent.endTransaction()
      agent.flush(function (err) {
        t.error(err, 'no error passed to agent.flush callback')
        t.equal(apmServer.events.length, 2, 'apmServer got 2 events')
        const trans = apmServer.events[1].transaction
        t.ok(trans, 'event 1 is a transaction')
        t.equal(trans.name, 'foo', 'the transaction has the expected name')

        apmServer.close()
        agent.destroy()
        t.end()
      })
    })
  })

  t.end()
})

test('#captureError()', function (t) {
  let apmServer
  let ceAgentOpts

  t.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl)
      ceAgentOpts = Object.assign(
        {},
        agentOpts,
        { serverUrl }
      )
      t.end()
    })
  })

  t.test('with callback', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError(new Error('with callback'), function (err, id) {
      t.error(err, 'no error from captureError callback')
      t.ok(/^[a-z0-9]{32}$/i.test(id), 'has valid error.id')
      t.equal(apmServer.events.length, 2, 'APM server got 2 events')
      assertMetadata(t, apmServer.events[0].metadata)
      const data = apmServer.events[1].error
      t.strictEqual(data.exception.message, 'with callback')

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('without callback', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError(new Error('without callback'))
    setTimeout(function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events')
      assertMetadata(t, apmServer.events[0].metadata)
      const data = apmServer.events[1].error
      t.strictEqual(data.exception.message, 'without callback')

      apmServer.clear()
      agent.destroy()
      t.end()
    }, 50) // Hack wait for captured error to be encoded and sent.
  })

  t.test('generate error id', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError(new Error('foo'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events')
      const data = apmServer.events[1].error
      t.ok(/^[a-z0-9]{32}$/i.test(data.id), 'has valid error.id')

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('should send a plain text message to the server', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError('Hey!', function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events')
      const data = apmServer.events[1].error
      t.strictEqual(data.log.message, 'Hey!')

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('should use `param_message` as well as `message` if given an object as 1st argument', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError({ message: 'Hello %s', params: ['World'] },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'Hello World')
        t.strictEqual(data.log.param_message, 'Hello %s')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('should not fail on a non string err.message', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    var err = new Error()
    err.message = { foo: 'bar' }
    agent.captureError(err, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events')
      const data = apmServer.events[1].error
      t.strictEqual(data.exception.message, '[object Object]')

      apmServer.clear()
      agent.destroy()
      t.end()
    })
  })

  t.test('should allow custom log message together with exception', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError(new Error('foo'), { message: 'bar' },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'foo')
        t.strictEqual(data.log.message, 'bar')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('should adhere to default stackTraceLimit', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.captureError(deep(256),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.stacktrace.length, config.DEFAULTS.stackTraceLimit)
        t.strictEqual(data.exception.stacktrace[0].context_line.trim(), 'return new Error()')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('should adhere to custom stackTraceLimit', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { stackTraceLimit: 5 }
    ))
    agent.captureError(deep(42),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.stacktrace.length, 5)
        t.strictEqual(data.exception.stacktrace[0].context_line.trim(), 'return new Error()')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('should merge context', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    agent.startTransaction()
    t.strictEqual(agent.setUserContext({ a: 1, merge: { a: 2 } }), true)
    t.strictEqual(agent.setCustomContext({ a: 3, merge: { a: 4 } }), true)
    agent.captureError(
      new Error('foo'),
      {
        user: { b: 1, merge: { shallow: true } },
        custom: { b: 2, merge: { shallow: true } }
      },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.deepEqual(data.context.user, { a: 1, b: 1, merge: { shallow: true } })
        t.deepEqual(data.context.custom, { a: 3, b: 2, merge: { shallow: true } })

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - off (error)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }
    ))
    agent.captureError(new Error('foo'),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'foo')
        t.notOk('log' in data, 'should not have a log')
        assertStackTrace(t, data.exception.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - off (string)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }
    ))
    agent.captureError('foo',
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'foo')
        t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace')
        t.notOk('exception' in data, 'should not have an exception')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - off (param msg)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }
    ))
    agent.captureError({ message: 'Hello %s', params: ['World'] },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'Hello World')
        t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace')
        t.notOk('exception' in data, 'should not have an exception')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - non-errors (error)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }
    ))
    agent.captureError(new Error('foo'),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'foo')
        t.notOk('log' in data, 'should not have a log')
        assertStackTrace(t, data.exception.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - non-errors (string)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }
    ))
    agent.captureError('foo',
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'foo')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - non-errors (param msg)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }
    ))
    agent.captureError({ message: 'Hello %s', params: ['World'] },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'Hello World')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - all (error)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }
    ))
    agent.captureError(new Error('foo'),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'foo')
        t.strictEqual(data.exception.message, 'foo')
        assertStackTrace(t, data.log.stacktrace)
        assertStackTrace(t, data.exception.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - all (string)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }
    ))
    agent.captureError('foo',
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'foo')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture location stack trace - all (param msg)', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }
    ))
    agent.captureError({ message: 'Hello %s', params: ['World'] },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        const data = apmServer.events[1].error
        t.strictEqual(data.log.message, 'Hello World')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('capture error before agent is started - with callback', function (t) {
    const agent = new Agent()
    agent.captureError(new Error('foo'), function (err) {
      t.strictEqual(err.message, 'cannot capture error before agent is started')
      agent.destroy()
      t.end()
    })
  })

  t.test('capture error before agent is started - without callback', function (t) {
    const agent = new Agent()
    agent.captureError(new Error('foo'))
    agent.destroy()
    t.end()
  })

  // XXX This one is relying on the agent.captureError change to stash `this._transport`
  //     so delayed-processing error from the previous one or two test cases don't bleed into this one.
  t.test('include valid context ids and sampled flag', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    const trans = agent.startTransaction('foo')
    const span = agent.startSpan('bar')
    agent.captureError(
      new Error('with callback'),
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'with callback')
        t.strictEqual(data.id.length, 32, 'id is 32 characters')
        t.strictEqual(data.parent_id, span.id, 'parent_id matches span id')
        t.strictEqual(data.trace_id, trans.traceId, 'trace_id matches transaction trace id')
        t.strictEqual(data.transaction_id, trans.id, 'transaction_id matches transaction id')
        t.strictEqual(data.transaction.type, trans.type, 'transaction.type matches transaction type')
        t.strictEqual(data.transaction.sampled, true, 'is sampled')

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('custom timestamp', function (t) {
    const agent = new Agent().start(ceAgentOpts)
    const timestamp = Date.now() - 1000
    agent.captureError(
      new Error('with callback'),
      { timestamp },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.strictEqual(data.timestamp, timestamp * 1000)

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('options.request', function (t) {
    const agent = new Agent().start(ceAgentOpts)

    const req = new http.IncomingMessage()
    req.httpVersion = '1.1'
    req.method = 'POST'
    req.url = '/foo?bar=baz#hash'
    req.socket = { remoteAddress: '127.0.0.1' }
    req.headers['content-length'] = 4
    req.headers.string = 'foo'
    req.headers.number = 42 // in case someone messes with the headers
    req.headers.array = ['foo', 42]
    req.headers.password = 'this should be redacted' // testing sanitizeFieldNames
    req.body = 'test'

    agent.captureError(
      new Error('with request'),
      { request: req },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'with request')
        t.deepEqual(data.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: { raw: '/foo?bar=baz#hash', protocol: 'http:', pathname: '/foo', search: '?bar=baz' },
          socket: { remote_address: '127.0.0.1', encrypted: false },
          headers: {
            'content-length': '4',
            string: 'foo',
            number: '42',
            array: ['foo', '42'],
            password: '[REDACTED]'
          },
          body: '[REDACTED]'
        })

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  // This tests that a urlencoded request body captured in an *error* event
  // is properly sanitized according to sanitizeFieldNames.
  t.test('options.request + captureBody=errors', function (t) {
    const agent = new Agent().start(Object.assign(
      {},
      ceAgentOpts,
      { captureBody: 'errors' }
    ))

    const req = new http.IncomingMessage()
    req.httpVersion = '1.1'
    req.method = 'POST'
    req.url = '/'
    req.socket = { remoteAddress: '127.0.0.1' }
    req.body = 'foo=bar&password=sekrit'
    const bodyLen = Buffer.byteLength(req.body)
    req.headers['content-length'] = String(bodyLen)
    req.headers['content-type'] = 'application/x-www-form-urlencoded'

    agent.captureError(
      new Error('with request'),
      { request: req },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'with request')
        t.deepEqual(data.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: { raw: '/', protocol: 'http:', pathname: '/' },
          socket: { remote_address: '127.0.0.1', encrypted: false },
          headers: {
            'content-length': String(bodyLen),
            'content-type': 'application/x-www-form-urlencoded'
          },
          body: 'foo=bar&password=' + encodeURIComponent('[REDACTED]')
        })

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('options.response', function (t) {
    const agent = new Agent().start(ceAgentOpts)

    const req = new http.IncomingMessage()
    const res = new http.ServerResponse(req)
    res.statusCode = 204
    res.headers = {
      'content-length': 4,
      string: 'foo',
      number: 42, // in case someone messes with the headers
      array: ['foo', 42],
      password: 'this should be redacted' // testing sanitizeFieldNames
    }

    agent.captureError(
      new Error('with response'),
      { response: res },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events')
        assertMetadata(t, apmServer.events[0].metadata)
        const data = apmServer.events[1].error
        t.strictEqual(data.exception.message, 'with response')
        t.deepEqual(data.context.response, {
          status_code: 204,
          headers: {
            'content-length': '4',
            string: 'foo',
            number: '42',
            array: ['foo', '42'],
            password: '[REDACTED]'
          },
          headers_sent: false,
          finished: false
        })

        apmServer.clear()
        agent.destroy()
        t.end()
      }
    )
  })

  t.test('teardown mock APM server', function (t) {
    apmServer.close()
    t.end()
  })

  t.end()
})

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    t.strictEqual(process._events.uncaughtException, undefined)
    const agent = new Agent().start(agentOptsNoopTransport)
    t.strictEqual(process._events.uncaughtException, undefined)
    agent.handleUncaughtExceptions()
    t.strictEqual(process._events.uncaughtException.length, 1)

    agent.destroy()
    t.end()
  })

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)
    agent.handleUncaughtExceptions()
    var before = process._events.uncaughtException.length
    agent.handleUncaughtExceptions()
    t.strictEqual(process._events.uncaughtException.length, before)

    agent.destroy()
    t.end()
  })

  t.test('should send an uncaughtException to server', function (t) {
    const apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(Object.assign(
        {},
        agentOpts,
        { serverUrl }
      ))

      let handlerErr
      agent.handleUncaughtExceptions(function (err) {
        handlerErr = err
      })

      process.emit('uncaughtException', new Error('uncaught'))

      setTimeout(() => {
        agent.flush(function () {
          t.equal(apmServer.events.length, 2, 'apmServer got 2 events')
          assertMetadata(t, apmServer.events[0].metadata)
          const data = apmServer.events[1].error
          t.strictEqual(data.exception.message, 'uncaught')

          t.ok(handlerErr, 'the registered uncaughtException handler was called')
          t.equal(handlerErr.message, 'uncaught')

          apmServer.close()
          agent.destroy()
          t.end()
        })
      }, 50) // Hack wait for the agent's handler to finish captureError.
    })
  })

  t.end()
})

test('#active: false', function (t) {
  t.test('should not error when started in an inactive state', function (t) {
    const agent = new Agent().start({ active: false })
    t.ok(agent.startTransaction())
    t.doesNotThrow(() => agent.endTransaction())
    agent.destroy()
    t.end()
  })
})

test('patches', function (t) {
  t.test('#clearPatches(name)', function (t) {
    const agent = new Agent()
    t.ok(agent._instrumentation._patches.has('express'))
    t.doesNotThrow(() => agent.clearPatches('express'))
    t.notOk(agent._instrumentation._patches.has('express'))
    t.doesNotThrow(() => agent.clearPatches('does-not-exists'))
    agent.destroy()
    t.end()
  })

  t.test('#addPatch(name, moduleName)', function (t) {
    const agent = new Agent()
    agent.clearPatches('express')
    agent.start(agentOptsNoopTransport)

    agent.addPatch('express', './test/_patch.js')

    const before = require('express')
    const patch = require('./_patch')

    delete require.cache[require.resolve('express')]
    t.deepEqual(require('express'), patch(before))

    agent.destroy()
    t.end()
  })

  t.test('#addPatch(name, function) - does not exist', function (t) {
    const agent = new Agent()
    agent.clearPatches('express')
    agent.start(agentOptsNoopTransport)

    var replacement = {
      foo: 'bar'
    }

    agent.addPatch('express', (exports, agent, { version, enabled }) => {
      t.ok(exports)
      t.ok(agent)
      t.ok(version)
      t.ok(enabled)
      return replacement
    })

    delete require.cache[require.resolve('express')]
    t.deepEqual(require('express'), replacement)

    agent.destroy()
    t.end()
  })

  t.test('#removePatch(name, handler)', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport)

    t.notOk(agent._instrumentation._patches.has('does-not-exist'))

    agent.addPatch('does-not-exist', '/foo.js')
    t.ok(agent._instrumentation._patches.has('does-not-exist'))
    agent.removePatch('does-not-exist', '/foo.js')
    t.notOk(agent._instrumentation._patches.has('does-not-exist'))

    const handler = exports => exports
    agent.addPatch('does-not-exist', handler)
    t.ok(agent._instrumentation._patches.has('does-not-exist'))
    agent.removePatch('does-not-exist', handler)
    t.notOk(agent._instrumentation._patches.has('does-not-exist'))

    agent.destroy()
    t.end()
  })
})

test('#registerMetric(name, labels, callback)', function (t) {
  const agent = new Agent().start(agentOptsNoopTransport)

  const mockMetrics = {
    calledCount: 0,
    callback: null,
    cbValue: 0,
    labels: null,
    name: null,
    getOrCreateGauge (...args) {
      this.calledCount++
      this.name = args[0]
      this.callback = args[1]
      this.labels = args[2]
      this.cbValue = this.callback()
    },
    stop () {
    }
  }

  agent._metrics = mockMetrics

  const cb = () => { return 12345 }
  const labels = { abc: 123 }

  // with labels
  agent.registerMetric('custom-metrics', labels, cb)

  t.strictEqual(mockMetrics.calledCount, 1)
  t.strictEqual(mockMetrics.name, 'custom-metrics')
  t.strictEqual(mockMetrics.callback, cb)
  t.strictEqual(mockMetrics.labels, labels)
  t.strictEqual(mockMetrics.cbValue, 12345)

  // without labels
  const cb2 = () => { return 6789 }
  agent.registerMetric('custom-metrics2', cb2)

  t.strictEqual(mockMetrics.calledCount, 2)
  t.strictEqual(mockMetrics.name, 'custom-metrics2')
  t.strictEqual(mockMetrics.callback, cb2)
  t.strictEqual(mockMetrics.labels, undefined)
  t.strictEqual(mockMetrics.cbValue, 6789)

  agent.destroy()
  t.end()
})
