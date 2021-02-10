'use strict'

const existingValue = process.env.ELASTIC_APM_CENTRAL_CONFIG
delete process.env.ELASTIC_APM_CENTRAL_CONFIG

const { URL } = require('url')
const http = require('http')

const test = require('tape')
const Agent = require('./_agent')

const runTestsWithServer = (t, updates, expect) => {
  t.plan(Object.keys(expect).length + 1)
  let agent, timer
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents')
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate'
    })
    res.end(JSON.stringify(updates))
    clearTimeout(timer)
    agent.destroy()
    server.close()
  })

  server.listen(function () {
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: true
    })

    for (const key in expect) {
      if (!Object.prototype.hasOwnProperty.call(agent._conf, key)) {
        t.fail('unknown config key: ' + key)
        t.end()
      } else {
        Object.defineProperty(agent._conf, key, {
          set (value) {
            const expectValue = expect[key]
            if (expectValue !== undefined) {
              t.deepEqual(value, expectValue)
              delete expect[key]
              if (Object.keys(expect).length === 0) {
                t.end()
              }
            }
          },
          get () {},
          enumerable: true,
          configurable: true
        })
      }
    }

    timer = setTimeout(function () {
      t.fail('should poll APM Server for config')
    }, 1000)
  })

  t.on('end', function () {
    if (existingValue) process.env.ELASTIC_APM_CENTRAL_CONFIG = existingValue
  })
}

test('remote config enabled', function (t) {
  const updates = {
    transaction_sample_rate: '0.42',
    transaction_max_spans: '99',
    capture_body: 'all',
    transaction_ignore_urls: ['foo'],
    log_level: 'debug'
  }
  const expect = {
    transactionSampleRate: 0.42,
    transactionMaxSpans: 99,
    captureBody: 'all',
    transactionIgnoreUrls: ['foo'],
    logLevel: 'debug'
  }

  runTestsWithServer(t, updates, expect)
})

test('remote config enabled: receives comma delimited', function (t) {
  const updates = {
    transaction_sample_rate: '0.42',
    transaction_max_spans: '99',
    capture_body: 'all',
    transaction_ignore_urls: 'foo,bar , baz , bling'
  }
  const expect = {
    transactionSampleRate: 0.42,
    transactionMaxSpans: 99,
    captureBody: 'all',
    transactionIgnoreUrls: ['foo', 'bar', 'baz', 'bling']
  }

  runTestsWithServer(t, updates, expect)
})

test('remote config enabled: receives non delimited string', function (t) {
  const updates = {
    transaction_sample_rate: '0.42',
    transaction_max_spans: '99',
    capture_body: 'all',
    transaction_ignore_urls: 'foo:bar'
  }
  const expect = {
    transactionSampleRate: 0.42,
    transactionMaxSpans: 99,
    captureBody: 'all',
    transactionIgnoreUrls: ['foo:bar']
  }

  runTestsWithServer(t, updates, expect)
})

// Ensure the logger updates if the central config `log_level` changes.
test('agent.logger updates for central config `log_level` change', { timeout: 1000 }, function (t) {
  let agent

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config with log_level=error.
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents')
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate'
    })
    res.end(JSON.stringify({ log_level: 'error' }))

    agent._transport.once('config', function () {
      // 4. agent.logger should be updated from central config.
      t.equal(agent.logger.level, 'error',
        'shortly after fetching central config, agent.logger level should be updated')

      agent.destroy()
      server.close()
      t.end()
    })
  })

  // 1. Start a mock APM Server.
  server.listen(function () {
    // 2. Start an agent with logLevel=debug.
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: true,
      logLevel: 'debug'
    })

    t.equal(agent.logger.level, 'debug',
      'immediately after .start() logger level should be the given "debug" level')
  })
})

// Ensure that a central config that updates some var other than `cloudProvider`
// does not result in *cloudProvider* being updated (issue #1976).
test('central config change does not erroneously update cloudProvider', {timeout: 1000}, function (t) {
  let agent

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config. We provide some non-empty
    //    config change that does not include `cloudProvider`.
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents')
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate'
    })
    res.end(JSON.stringify({ log_level: 'error' }))

    agent._transport.once('config', function () {
      // 4. Ensure that `cloudProvider` is *not* reset to the default "auto".
      t.equal(agent._conf.cloudProvider, 'aws',
        'after fetching central config, cloudProvider is not reset to default')

      agent.destroy()
      server.close()
      t.end()
    })
  })

  // 1. Start a mock APM Server.
  server.listen(function () {
    // 2. Start an agent with cloudProvider=aws.
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      centralConfig: true,
      cloudProvider: 'aws',
      // These settings to reduce some agent activity:
      captureExceptions: false,
      metricsInterval: 0
    })

    t.equal(agent._conf.cloudProvider, 'aws',
      'immediately after .start(), cloudProvider=aws')
  })
})
