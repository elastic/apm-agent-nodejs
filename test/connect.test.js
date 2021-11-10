'use strict'

// Test the `apm.middleware.connect()` public method.

const tape = require('tape')

const Agent = require('../lib/agent')
const { MockAPMServer } = require('./_mock_apm_server')
const { findObjInArray } = require('./_utils')

tape.test('apm.middleware.connect()', function (t) {
  let apmServer
  const agentOpts = {
    serviceName: 'test-connect',
    centralConfig: false,
    captureExceptions: false,
    metricsInterval: '0s',
    cloudProvider: 'none',
    stackTraceLimit: 2,
    logLevel: 'warn'
  }

  t.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl)
      agentOpts.serverUrl = serverUrl
      t.end()
    })
  })

  t.test('connect middleware should capture errors', function (t) {
    const agent = new Agent().start(agentOpts)

    // Delay importing this until the agent is started.
    const connect = require('connect')
    const http = require('http')

    const app = connect()
    app.use(function (req, res, next) {
      switch (req.url) {
        case '/error':
          res.writeHead(500)
          res.end()
          next(new Error('responding with an Error'))
          break
        case '/throw':
          throw new Error('throwing an Error')
        default:
          res.end()
      }
    })
    app.use(agent.middleware.connect())

    const server = http.createServer(app)
    server.listen(function () {
      var port = server.address().port
      var baseUrl = 'http://localhost:' + port
      t.comment('test server url: ' + baseUrl)

      http.get(baseUrl + '/error', function () {
        http.get(baseUrl + '/throw', function () {
          agent.flush(function () {
            t.ok(apmServer.events[0].metadata, 'event 0 is metadata')

            const err1 = findObjInArray(apmServer.events, 'error.exception.message', 'responding with an Error')
            t.ok(err1, 'the "responding with an Error" error was captured')
            const err2 = findObjInArray(apmServer.events, 'error.exception.message', 'throwing an Error')
            t.ok(err2, 'the "throwing an Error" error was captured')

            server.close()
            agent.destroy()
            t.end()
          })
        })
      })
    })

    // agent.captureError(
    //   new Error('foo'),
    //   { custom: { order: 0 } },
    //   function (err) {
    //     t.error(err, 'captureError should not fail')
    //     t.equal(apmServer.events.length, 2, 'got 2 events')
    //     t.ok(apmServer.events[0].metadata, 'event 0 is metadata')
    //     assertMetadata(t, apmServer.events[0].metadata)
    //     const data = apmServer.events[1].error
    //     t.ok(data, 'event 1 is an error')
    //     t.strictEqual(data.exception.message, 'foo')
    //     t.strictEqual(data.context.custom.order, 2)

    //     apmServer.clear()
    //     agent.destroy()
    //     t.end()
    //   }
    // )
  })

  t.test('teardown mock APM server', function (t) {
    apmServer.close()
    t.end()
  })

  t.end()
})
