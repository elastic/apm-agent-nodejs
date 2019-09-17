'use strict'

var http = require('http')
var path = require('path')
var os = require('os')

var { sync: containerInfo } = require('container-info')
var isError = require('core-util-is').isError
var test = require('tape')

var Agent = require('./_agent')
var APMServer = require('./_apm_server')
var config = require('../lib/config')

var agentVersion = require('../package.json').version
var inContainer = 'containerId' in (containerInfo() || {})

process.env.ELASTIC_APM_METRICS_INTERVAL = '0'
process.env.ELASTIC_APM_CENTRAL_CONFIG = 'false'

test('#setFramework()', function (t) {
  var agent = Agent()
  agent.start()
  t.equal(agent._conf.frameworkName, undefined)
  t.equal(agent._conf.frameworkVersion, undefined)
  t.equal(agent._transport._conf.frameworkName, undefined)
  t.equal(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({})
  t.equal(agent._conf.frameworkName, undefined)
  t.equal(agent._conf.frameworkVersion, undefined)
  t.equal(agent._transport._conf.frameworkName, undefined)
  t.equal(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({ name: 'foo' })
  t.equal(agent._conf.frameworkName, 'foo')
  t.equal(agent._conf.frameworkVersion, undefined)
  t.equal(agent._transport._conf.frameworkName, 'foo')
  t.equal(agent._transport._conf.frameworkVersion, undefined)
  agent.setFramework({ version: 'bar' })
  t.equal(agent._conf.frameworkName, 'foo')
  t.equal(agent._conf.frameworkVersion, 'bar')
  t.equal(agent._transport._conf.frameworkName, 'foo')
  t.equal(agent._transport._conf.frameworkVersion, 'bar')
  agent.setFramework({ name: 'a', version: 'b' })
  t.equal(agent._conf.frameworkName, 'a')
  t.equal(agent._conf.frameworkVersion, 'b')
  t.equal(agent._transport._conf.frameworkName, 'a')
  t.equal(agent._transport._conf.frameworkVersion, 'b')
  agent.setFramework({ name: 'foo', version: 'bar', overwrite: false })
  t.equal(agent._conf.frameworkName, 'a')
  t.equal(agent._conf.frameworkVersion, 'b')
  t.equal(agent._transport._conf.frameworkName, 'a')
  t.equal(agent._transport._conf.frameworkVersion, 'b')
  t.end()
})

test('#startTransaction()', function (t) {
  t.test('name and type', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction('foo', 'bar')
    t.equal(trans.name, 'foo')
    t.equal(trans.type, 'bar')
    t.end()
  })

  t.test('options.startTime', function (t) {
    var agent = Agent()
    agent.start()
    var startTime = Date.now() - 1000
    var trans = agent.startTransaction('foo', 'bar', { startTime })
    trans.end()
    var duration = trans.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var agent = Agent()
    agent.start()
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = agent.startTransaction('foo', 'bar', { childOf })
    t.equal(trans._context.version, '00')
    t.equal(trans._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(trans._context.id, '00f067aa0ba902b7')
    t.equal(trans._context.parentId, '00f067aa0ba902b7')
    t.equal(trans._context.flags, '01')
    t.end()
  })

  t.test('traceparent (legacy)', function (t) {
    var agent = Agent()
    agent.start()
    var traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var trans = agent.startTransaction('foo', 'bar', traceparent)
    t.equal(trans._context.version, '00')
    t.equal(trans._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(trans._context.id, '00f067aa0ba902b7')
    t.equal(trans._context.parentId, '00f067aa0ba902b7')
    t.equal(trans._context.flags, '01')
    t.end()
  })
})

test('#endTransaction()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    agent.endTransaction()
    t.end()
  })

  t.test('with no result', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(trans.ended, false)
    agent.endTransaction()
    t.equal(trans.ended, true)
    t.equal(trans.result, 'success')
    t.end()
  })

  t.test('with explicit result', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(trans.ended, false)
    agent.endTransaction('done')
    t.equal(trans.ended, true)
    t.equal(trans.result, 'done')
    t.end()
  })

  t.test('with custom endTime', function (t) {
    var agent = Agent()
    agent.start()
    var startTime = Date.now() - 1000
    var endTime = startTime + 2000.123
    var trans = agent.startTransaction('foo', 'bar', { startTime })
    agent.endTransaction('done', endTime)
    t.equal(trans.duration(), 2000.123)
    t.end()
  })
})

test('#currentTransaction', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.notOk(agent.currentTransaction)
    t.end()
  })

  t.test('with active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.currentTransaction, trans)
    agent.endTransaction()
    t.end()
  })
})

test('#currentSpan', function (t) {
  t.test('no active or binding span', function (t) {
    var agent = Agent()
    agent.start()
    t.notOk(agent.currentSpan)
    t.end()
  })

  t.test('with binding span', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    var span = agent.startSpan()
    t.equal(agent.currentSpan, span)
    span.end()
    trans.end()
    t.end()
  })

  t.test('with active span', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    var span = agent.startSpan()
    process.nextTick(() => {
      t.equal(agent.currentSpan, span)
      span.end()
      trans.end()
      t.end()
    })
  })
})

test('#currentTraceparent', function (t) {
  t.test('no active transaction or span', function (t) {
    var agent = Agent()
    agent.start()
    t.notOk(agent.currentTraceparent)
    t.end()
  })

  t.test('with active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.currentTraceparent, trans.traceparent)
    agent.endTransaction()
    t.end()
  })

  t.test('with active span', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var span = agent.startSpan()
    t.equal(agent.currentTraceparent, span.traceparent)
    span.end()
    agent.endTransaction()
    t.end()
  })
})

test('#setTransactionName', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.doesNotThrow(function () {
      agent.setTransactionName('foo')
    })
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    agent.setTransactionName('foo')
    t.equal(trans.name, 'foo')
    t.end()
  })
})

test('#startSpan()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.startSpan(), null)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var span = agent.startSpan('span-name', 'span-type')
    t.ok(span, 'should return a span')
    t.equal(span.name, 'span-name')
    t.equal(span.type, 'span-type')
    t.end()
  })

  t.test('options.startTime', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var startTime = Date.now() - 1000
    var span = agent.startSpan(null, null, { startTime })
    span.end()
    var duration = span.duration()
    t.ok(duration > 990, `duration should be circa more than 1s (was: ${duration})`) // we've seen 998.752 in the wild
    t.ok(duration < 1100, `duration should be less than 1.1s (was: ${duration})`)
    t.end()
  })

  t.test('options.childOf', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var span = agent.startSpan(null, null, { childOf })
    t.equal(span._context.version, '00')
    t.equal(span._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.id, '00f067aa0ba902b7')
    t.equal(span._context.parentId, '00f067aa0ba902b7')
    t.equal(span._context.flags, '01')
    t.end()
  })

  t.test('traceparent (legacy)', function (t) {
    var agent = Agent()
    agent.start()
    agent.startTransaction()
    var traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    var span = agent.startSpan(null, null, traceparent)
    t.equal(span._context.version, '00')
    t.equal(span._context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    t.notEqual(span._context.id, '00f067aa0ba902b7')
    t.equal(span._context.parentId, '00f067aa0ba902b7')
    t.equal(span._context.flags, '01')
    t.end()
  })
})

test('#setUserContext()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.setUserContext({ foo: 1 }), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setUserContext({ foo: 1 }), true)
    t.deepEqual(trans._user, { foo: 1 })
    t.end()
  })
})

test('#setCustomContext()', function (t) {
  t.test('no active transaction', function (t) {
    var agent = Agent()
    agent.start()
    t.equal(agent.setCustomContext({ foo: 1 }), false)
    t.end()
  })

  t.test('active transaction', function (t) {
    var agent = Agent()
    agent.start()
    var trans = agent.startTransaction()
    t.equal(agent.setCustomContext({ foo: 1 }), true)
    t.deepEqual(trans._custom, { foo: 1 })
    t.end()
  })
})

var singleLabelTests = [
  { name: '#setLabel()', method: 'setLabel' },
  { name: '#setTag() - deprecated', method: 'setTag' }
]
singleLabelTests.forEach((labelTest) => {
  test(labelTest.name, function (t) {
    t.test('no active transaction', function (t) {
      var agent = Agent()
      agent.start()
      t.equal(agent[labelTest.method]('foo', 1), false)
      t.end()
    })

    t.test('active transaction', function (t) {
      var agent = Agent()
      agent.start()
      var trans = agent.startTransaction()
      t.equal(agent[labelTest.method]('foo', 1), true)
      t.deepEqual(trans._labels, { foo: '1' })
      t.end()
    })
  })
})

var multipleLabelTests = [
  { name: '#addLabels()', method: 'addLabels' },
  { name: '#addTags() - deprecated', method: 'addTags' }
]
multipleLabelTests.forEach((multipleTest) => {
  test(multipleTest.name, function (t) {
    t.test('no active transaction', function (t) {
      var agent = Agent()
      agent.start()
      t.equal(agent[multipleTest.method]({ foo: 1 }), false)
      t.end()
    })

    t.test('active transaction', function (t) {
      var agent = Agent()
      agent.start()
      var trans = agent.startTransaction()
      t.equal(agent[multipleTest.method]({ foo: 1, bar: 2 }), true)
      t.equal(agent[multipleTest.method]({ foo: 3 }), true)
      t.deepEqual(trans._labels, { foo: '3', bar: '2' })
      t.end()
    })
  })
})

test('filters', function (t) {
  t.test('#addFilter() - error', function (t) {
    t.plan(6 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.addFilter(function (obj) {
          t.equal(obj.exception.message, 'foo')
          t.equal(++obj.context.custom.order, 1)
          return obj
        })
        this.agent.addFilter('invalid')
        this.agent.addFilter(function (obj) {
          t.equal(obj.exception.message, 'foo')
          t.equal(++obj.context.custom.order, 2)
          return obj
        })

        this.agent.captureError(new Error('foo'), { custom: { order: 0 } })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.equal(data.context.custom.order, 2)
        t.end()
      })
  })

  t.test('#addFilter() - transaction', function (t) {
    t.plan(6 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'transaction' })
      .on('listening', function () {
        this.agent.addFilter(function (obj) {
          t.equal(obj.name, 'transaction-name')
          t.equal(++obj.context.custom.order, 1)
          return obj
        })
        this.agent.addFilter('invalid')
        this.agent.addFilter(function (obj) {
          t.equal(obj.name, 'transaction-name')
          t.equal(++obj.context.custom.order, 2)
          return obj
        })

        this.agent.startTransaction('transaction-name')
        this.agent.setCustomContext({ order: 0 })
        this.agent.endTransaction()
        this.agent.flush()
      })
      .on('data-transaction', function (data) {
        t.equal(data.name, 'transaction-name')
        t.equal(data.context.custom.order, 2)
        t.end()
      })
  })

  t.test('#addFilter() - span', function (t) {
    t.plan(5 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'span' })
      .on('listening', function () {
        this.agent.addFilter(function (obj) {
          t.equal(obj.name, 'span-name')
          obj.order = 1
          return obj
        })
        this.agent.addFilter('invalid')
        this.agent.addFilter(function (obj) {
          t.equal(obj.name, 'span-name')
          t.equal(++obj.order, 2)
          return obj
        })

        this.agent.startTransaction()
        const span = this.agent.startSpan('span-name')
        span.end()
        setTimeout(() => {
          this.agent.flush()
        }, 50)
      })
      .on('data-span', function (data) {
        t.equal(data.name, 'span-name')
        t.equal(data.order, 2)
        t.end()
      })
  })

  t.test('#addErrorFilter()', function (t) {
    t.plan(6 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.addTransactionFilter(function () {
          t.fail('should not call transaction filter')
        })
        this.agent.addSpanFilter(function () {
          t.fail('should not call span filter')
        })
        this.agent.addErrorFilter(function (obj) {
          t.equal(obj.exception.message, 'foo')
          t.equal(++obj.context.custom.order, 1)
          return obj
        })
        this.agent.addErrorFilter('invalid')
        this.agent.addErrorFilter(function (obj) {
          t.equal(obj.exception.message, 'foo')
          t.equal(++obj.context.custom.order, 2)
          return obj
        })

        this.agent.captureError(new Error('foo'), { custom: { order: 0 } })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.equal(data.context.custom.order, 2)
        t.end()
      })
  })

  t.test('#addTransactionFilter()', function (t) {
    t.plan(6 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'transaction' })
      .on('listening', function () {
        this.agent.addErrorFilter(function () {
          t.fail('should not call error filter')
        })
        this.agent.addSpanFilter(function () {
          t.fail('should not call span filter')
        })
        this.agent.addTransactionFilter(function (obj) {
          t.equal(obj.name, 'transaction-name')
          t.equal(++obj.context.custom.order, 1)
          return obj
        })
        this.agent.addTransactionFilter('invalid')
        this.agent.addTransactionFilter(function (obj) {
          t.equal(obj.name, 'transaction-name')
          t.equal(++obj.context.custom.order, 2)
          return obj
        })

        this.agent.startTransaction('transaction-name')
        this.agent.setCustomContext({ order: 0 })
        this.agent.endTransaction()
        this.agent.flush()
      })
      .on('data-transaction', function (data) {
        t.equal(data.name, 'transaction-name')
        t.equal(data.context.custom.order, 2)
        t.end()
      })
  })

  t.test('#addSpanFilter()', function (t) {
    t.plan(5 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'span' })
      .on('listening', function () {
        this.agent.addErrorFilter(function () {
          t.fail('should not call error filter')
        })
        this.agent.addTransactionFilter(function () {
          t.fail('should not call transaction filter')
        })
        this.agent.addSpanFilter(function (obj) {
          t.equal(obj.name, 'span-name')
          obj.order = 1
          return obj
        })
        this.agent.addSpanFilter('invalid')
        this.agent.addSpanFilter(function (obj) {
          t.equal(obj.name, 'span-name')
          t.equal(++obj.order, 2)
          return obj
        })

        this.agent.startTransaction()
        const span = this.agent.startSpan('span-name')
        span.end()
        setTimeout(() => {
          this.agent.flush()
        }, 50)
      })
      .on('data-span', function (data) {
        t.equal(data.name, 'span-name')
        t.equal(data.order, 2)
        t.end()
      })
  })

  t.test('#addFilter() - abort', function (t) {
    t.plan(1)

    const server = http.createServer(function (req, res) {
      t.fail('should not send any data')
    })

    server.listen(function () {
      const agent = Agent().start({ serverUrl: 'http://localhost:' + server.address().port })

      agent.addFilter(function (obj) {
        t.equal(obj.exception.message, 'foo')
        return false
      })
      agent.addFilter(function () {
        t.fail('should not call 2nd filter')
      })

      agent.captureError(new Error('foo'))

      setTimeout(function () {
        t.end()
        server.close()
      }, 50)
    })
  })

  t.test('#addErrorFilter() - abort', function (t) {
    t.plan(1)

    const server = http.createServer(function (req, res) {
      t.fail('should not send any data')
    })

    server.listen(function () {
      const agent = Agent().start({
        serverUrl: 'http://localhost:' + server.address().port,
        captureExceptions: false
      })

      agent.addErrorFilter(function (obj) {
        t.equal(obj.exception.message, 'foo')
        return false
      })
      agent.addErrorFilter(function () {
        t.fail('should not call 2nd filter')
      })

      agent.captureError(new Error('foo'))

      setTimeout(function () {
        t.end()
        server.close()
      }, 50)
    })
  })

  t.test('#addTransactionFilter() - abort', function (t) {
    t.plan(1)

    const server = http.createServer(function (req, res) {
      t.fail('should not send any data')
    })

    server.listen(function () {
      const agent = Agent().start({
        serverUrl: 'http://localhost:' + server.address().port,
        captureExceptions: false
      })

      agent.addTransactionFilter(function (obj) {
        t.equal(obj.name, 'transaction-name')
        return false
      })
      agent.addTransactionFilter(function () {
        t.fail('should not call 2nd filter')
      })

      agent.startTransaction('transaction-name')
      agent.endTransaction()
      agent.flush()

      setTimeout(function () {
        t.end()
        server.close()
      }, 50)
    })
  })

  t.test('#addSpanFilter() - abort', function (t) {
    t.plan(1)

    const server = http.createServer(function (req, res) {
      t.fail('should not send any data')
    })

    server.listen(function () {
      const agent = Agent().start({
        serverUrl: 'http://localhost:' + server.address().port,
        captureExceptions: false
      })

      agent.addSpanFilter(function (obj) {
        t.equal(obj.name, 'span-name')
        return false
      })
      agent.addSpanFilter(function () {
        t.fail('should not call 2nd filter')
      })

      agent.startTransaction()
      const span = agent.startSpan('span-name')
      span.end()

      setTimeout(function () {
        agent.flush()
        setTimeout(function () {
          t.end()
          server.close()
        }, 50)
      }, 50)
    })
  })
})

test('#flush()', function (t) {
  t.test('start not called', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if agent.start() wasn\'t called')
    })
  })

  t.test('start called, but agent inactive', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.start({ active: false })
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if agent is inactive')
    })
  })

  t.test('agent started, but no data in the queue', function (t) {
    t.plan(2)
    var agent = Agent()
    agent.start()
    agent.flush(function (err) {
      t.error(err)
      t.pass('should call flush callback even if there\'s nothing to flush')
    })
  })

  t.test('agent started, but no data in the queue', function (t) {
    t.plan(3 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'transaction' })
      .on('listening', function () {
        this.agent.startTransaction('foo')
        this.agent.endTransaction()
        this.agent.flush(function (err) {
          t.error(err)
          t.pass('should call flush callback after flushing the queue')
        })
      })
      .on('data-transaction', function (data) {
        t.equal(data.name, 'foo')
        t.end()
      })
  })
})

test('#captureError()', function (t) {
  t.test('with callback', function (t) {
    t.plan(4 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('with callback'), function (err, id) {
          t.error(err)
          t.ok(/^[a-z0-9]{32}$/i.test(id), 'has valid error.id')
          t.pass('called callback')
        })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'with callback')
        t.end()
      })
  })

  t.test('without callback', function (t) {
    t.plan(1 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('without callback'))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'without callback')
        t.end()
      })
  })

  t.test('generate error id', function (t) {
    t.plan(1 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('data-error', function (data) {
        t.ok(/^[\da-f]{32}$/.test(data.id), `should have valid id (was: ${data.id})`)
        t.end()
      })
  })

  t.test('should send a plain text message to the server', function (t) {
    t.plan(1 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError('Hey!')
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'Hey!')
        t.end()
      })
  })

  t.test('should use `param_message` as well as `message` if given an object as 1st argument', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError({ message: 'Hello %s', params: ['World'] })
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'Hello World')
        t.equal(data.log.param_message, 'Hello %s')
        t.end()
      })
  })

  t.test('should not fail on a non string err.message', function (t) {
    t.plan(1 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        var err = new Error()
        err.message = { foo: 'bar' }
        this.agent.captureError(err)
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, '[object Object]')
        t.end()
      })
  })

  t.test('should allow custom log message together with exception', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'), { message: 'bar' })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.equal(data.log.message, 'bar')
        t.end()
      })
  })

  t.test('should not use custom log message together with exception if equal', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'), { message: 'foo' })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.equal(data.log, undefined)
        t.end()
      })
  })

  t.test('should adhere to default stackTraceLimit', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(deep(256))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.stacktrace.length, 50)
        t.equal(data.exception.stacktrace[0].context_line.trim(), 'return new Error()')
        t.end()
      })
  })

  t.test('should adhere to custom stackTraceLimit', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, { stackTraceLimit: 5 }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(deep(42))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.stacktrace.length, 5)
        t.equal(data.exception.stacktrace[0].context_line.trim(), 'return new Error()')
        t.end()
      })
  })

  t.test('should merge context', function (t) {
    t.plan(4 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        var agent = this.agent
        var server = http.createServer(function (req, res) {
          agent.startTransaction()
          t.equal(agent.setUserContext({ a: 1, merge: { a: 2 } }), true)
          t.equal(agent.setCustomContext({ a: 3, merge: { a: 4 } }), true)
          agent.captureError(new Error('foo'), { user: { b: 1, merge: { shallow: true } }, custom: { b: 2, merge: { shallow: true } } })
          res.end()
        })

        server.listen(function () {
          http.request({
            port: server.address().port
          }, function (res) {
            res.resume()
            res.on('end', function () {
              server.close()
            })
          }).end()
        })
      })
      .on('data-error', function (data) {
        t.deepEqual(data.context.user, { a: 1, b: 1, merge: { shallow: true } })
        t.deepEqual(data.context.custom, { a: 3, b: 2, merge: { shallow: true } })
        t.end()
      })
  })

  t.test('capture location stack trace - off (error)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.notOk('log' in data, 'should not have a log')
        assertStackTrace(t, data.exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - off (string)', function (t) {
    t.plan(3 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'foo')
        t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace')
        t.notOk('exception' in data, 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - off (param msg)', function (t) {
    t.plan(3 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError({ message: 'Hello %s', params: ['World'] })
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'Hello World')
        t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace')
        t.notOk('exception' in data, 'should not have an exception')
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (error)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'foo')
        t.notOk('log' in data, 'should not have a log')
        assertStackTrace(t, data.exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (string)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'foo')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - non-errors (param msg)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError({ message: 'Hello %s', params: ['World'] })
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'Hello World')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (error)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts * 2)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('foo'))
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'foo')
        t.equal(data.exception.message, 'foo')
        assertStackTrace(t, data.log.stacktrace)
        assertStackTrace(t, data.exception.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (string)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError('foo')
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'foo')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)
        t.end()
      })
  })

  t.test('capture location stack trace - all (param msg)', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts + assertStackTrace.asserts)
    APMServerWithDefaultAsserts(t, { captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS }, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError({ message: 'Hello %s', params: ['World'] })
      })
      .on('data-error', function (data) {
        t.equal(data.log.message, 'Hello World')
        t.notOk('exception' in data, 'should not have an exception')
        assertStackTrace(t, data.log.stacktrace)
        t.end()
      })
  })

  t.test('capture error before agent is started - with callback', function (t) {
    var agent = Agent()
    agent.captureError(new Error('foo'), function (err) {
      t.equal(err.message, 'cannot capture error before agent is started')
      t.end()
    })
  })

  t.test('capture error before agent is started - without callback', function (t) {
    var agent = Agent()
    agent.captureError(new Error('foo'))
    t.end()
  })

  t.test('include valid context ids and sampled flag', function (t) {
    t.plan(8 + APMServerWithDefaultAsserts.asserts)

    let trans = null
    let span = null
    const expect = [
      'metadata',
      'error'
    ]

    APMServerWithDefaultAsserts(t, {}, { expect })
      .on('listening', function () {
        trans = this.agent.startTransaction('foo')
        span = this.agent.startSpan('bar')
        this.agent.captureError(new Error('with callback'), function () {
          t.pass('called callback')
        })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'with callback')
        t.equal(data.id.length, 32, 'id is 32 characters')
        t.equal(data.parent_id, span.id, 'parent_id matches span id')
        t.equal(data.trace_id, trans.traceId, 'trace_id matches transaction trace id')
        t.equal(data.transaction_id, trans.id, 'transaction_id matches transaction id')
        t.equal(data.transaction.type, trans.type, 'transaction.type matches transaction type')
        t.equal(data.transaction.sampled, true, 'is sampled')
        t.end()
      })
  })

  t.test('custom timestamp', function (t) {
    t.plan(1 + APMServerWithDefaultAsserts.asserts)

    const timestamp = Date.now() - 1000
    const expect = [
      'metadata',
      'error'
    ]

    APMServerWithDefaultAsserts(t, {}, { expect })
      .on('listening', function () {
        this.agent.captureError(new Error('with callback'), { timestamp })
      })
      .on('data-error', function (data) {
        t.equal(data.timestamp, timestamp * 1000)
        t.end()
      })
  })

  t.test('options.request', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)

    const req = new http.IncomingMessage()
    req.httpVersion = '1.1'
    req.method = 'POST'
    req.url = '/foo?bar=baz#hash'
    req.socket = { remoteAddress: '127.0.0.1' }
    req.headers['content-length'] = 4
    req.headers['string'] = 'foo'
    req.headers['number'] = 42 // in case someone messes with the headers
    req.headers['array'] = ['foo', 42]
    req.body = 'test'

    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('with request'), { request: req })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'with request')
        t.deepEqual(data.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: { raw: '/foo?bar=baz#hash', protocol: 'http:', pathname: '/foo', search: '?bar=baz' },
          socket: { remote_address: '127.0.0.1', encrypted: false },
          headers: {
            'content-length': '4',
            'string': 'foo',
            'number': '42',
            'array': ['foo', '42']
          },
          body: '[REDACTED]'
        })
        t.end()
      })
  })

  t.test('options.response', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)

    const req = new http.IncomingMessage()
    const res = new http.ServerResponse(req)
    res.statusCode = 204
    res.headers = {
      'content-length': 4,
      string: 'foo',
      number: 42, // in case someone messes with the headers
      array: ['foo', 42]
    }

    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.captureError(new Error('with response'), { response: res })
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'with response')
        t.deepEqual(data.context.response, {
          status_code: 204,
          headers: {
            'content-length': '4',
            'string': 'foo',
            'number': '42',
            'array': ['foo', '42']
          },
          headers_sent: false,
          finished: false
        })
        t.end()
      })
  })
})

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    var agent = Agent()
    t.equal(process._events.uncaughtException, undefined)
    agent.start({
      serviceName: 'some-service-name',
      captureExceptions: false,
      logLevel: 'error'
    })
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, 1)
    t.end()
  })

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    var agent = Agent()
    agent.start({
      serviceName: 'some-service-name',
      captureExceptions: false,
      logLevel: 'error'
    })
    agent.handleUncaughtExceptions()
    var before = process._events.uncaughtException.length
    agent.handleUncaughtExceptions()
    t.equal(process._events.uncaughtException.length, before)
    t.end()
  })

  t.test('should send an uncaughtException to server', function (t) {
    t.plan(2 + APMServerWithDefaultAsserts.asserts)
    APMServerWithDefaultAsserts(t, {}, { expect: 'error' })
      .on('listening', function () {
        this.agent.handleUncaughtExceptions(function (err) {
          t.ok(isError(err))
        })
        process.emit('uncaughtException', new Error('uncaught'))
      })
      .on('data-error', function (data) {
        t.equal(data.exception.message, 'uncaught')
        t.end()
      })
  })
})

test('#active: false', function (t) {
  t.test('should not error when started in an inactive state', function (t) {
    var agent = Agent()
    var client = agent.start({ active: false })
    t.ok(client.startTransaction())
    t.doesNotThrow(() => client.endTransaction())
    t.end()
  })
})

test('patches', function (t) {
  t.test('#clearPatches(name)', function (t) {
    var agent = Agent()
    t.ok(agent._instrumentation._patches.has('express'))
    t.doesNotThrow(() => agent.clearPatches('express'))
    t.notOk(agent._instrumentation._patches.has('express'))
    t.doesNotThrow(() => agent.clearPatches('does-not-exists'))
    t.end()
  })

  t.test('#addPatch(name, moduleName)', function (t) {
    var agent = Agent()
    agent.clearPatches('express')
    agent.start()

    agent.addPatch('express', './test/_patch.js')

    const before = require('express')
    const patch = require('./_patch')

    delete require.cache[require.resolve('express')]
    t.deepEqual(require('express'), patch(before))

    t.end()
  })

  t.test('#addPatch(name, function) - does not exist', function (t) {
    var agent = Agent()
    agent.clearPatches('express')
    agent.start()

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

    t.end()
  })

  t.test('#removePatch(name, handler)', function (t) {
    var agent = Agent()
    agent.start()

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

    t.end()
  })
})

function assertMetadata (t, payload) {
  t.equal(payload.service.name, 'some-service-name')
  t.deepEqual(payload.service.runtime, { name: 'node', version: process.versions.node })
  t.deepEqual(payload.service.agent, { name: 'nodejs', version: agentVersion })

  const expectedSystemKeys = ['hostname', 'architecture', 'platform']
  if (inContainer) expectedSystemKeys.push('container')

  t.deepEqual(Object.keys(payload.system), expectedSystemKeys)
  t.equal(payload.system.hostname, os.hostname())
  t.equal(payload.system.architecture, process.arch)
  t.equal(payload.system.platform, process.platform)

  if (inContainer) {
    t.deepEqual(Object.keys(payload.system.container), ['id'])
    t.equal(typeof payload.system.container.id, 'string')
    t.ok(/^[\da-f]{64}$/.test(payload.system.container.id))
  }

  t.ok(payload.process)
  t.equal(payload.process.pid, process.pid)
  t.ok(payload.process.pid > 0, 'should have a pid greater than 0')
  t.ok(payload.process.title, 'should have a process title')
  t.ok(
    /(npm|node)/.test(payload.process.title),
    `process.title should contain expected value (was: "${payload.process.title}")`
  )
  t.deepEqual(payload.process.argv, process.argv)
  t.ok(payload.process.argv.length >= 2, 'should have at least two process arguments')
}
assertMetadata.asserts = inContainer ? 17 : 14

function assertTransaction (t, trans, name, input, output) {
  t.equal(trans.name, name)
  t.equal(trans.type, 'lambda')
  t.equal(trans.result, 'success')
  t.ok(trans.context)
  var custom = trans.context.custom
  t.ok(custom)
  var lambda = custom.lambda
  t.ok(lambda)
  t.deepEqual(lambda.input, input)
  t.equal(lambda.output, output)
}
assertTransaction.asserts = 8

function assertStackTrace (t, stacktrace) {
  t.ok(stacktrace !== undefined, 'should have a stack trace')
  t.ok(Array.isArray(stacktrace), 'stack trace should be an array')
  t.ok(stacktrace.length > 0, 'stack trace should have at least one frame')
  t.equal(stacktrace[0].filename, path.join('test', 'agent.js'))
}
assertStackTrace.asserts = 4

function validateRequest (t) {
  return function (req) {
    t.equal(req.method, 'POST', 'should be a POST request')
    t.equal(req.url, '/intake/v2/events', 'should be sent to the intake endpoint')
  }
}
validateRequest.asserts = 2

function validateMetadata (t) {
  return function (data, index) {
    t.equal(index, 0, 'metadata should always be sent first')
    assertMetadata(t, data)
  }
}
validateMetadata.asserts = 1 + assertMetadata.asserts

function APMServerWithDefaultAsserts (t, opts, mockOpts) {
  var server = APMServer(opts, mockOpts)
    .on('request', validateRequest(t))
    .on('data-metadata', validateMetadata(t))
  t.on('end', function () {
    server.destroy()
  })
  return server
}
APMServerWithDefaultAsserts.asserts = validateRequest.asserts + validateMetadata.asserts

function deep (depth, n) {
  if (!n) n = 0
  if (n < depth) return deep(depth, ++n)
  return new Error()
}
