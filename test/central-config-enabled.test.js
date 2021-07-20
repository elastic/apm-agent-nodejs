'use strict'

const existingValue = process.env.ELASTIC_APM_CENTRAL_CONFIG
delete process.env.ELASTIC_APM_CENTRAL_CONFIG

const { URL } = require('url')
const http = require('http')

const test = require('tape')
const Agent = require('./_agent')

const runTestsWithServer = (t, updates, expect) => {
  let agent

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config with log_level=error.
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents',
      'mock apm-server got central config request')
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate'
    })
    res.end(JSON.stringify(updates))

    // 4. After the 'config' event is handled in the agent, the expected
    //    config vars should be updated.
    agent._transport.once('config', function (remoteConf) {
      for (const key in expect) {
        t.deepEqual(agent._conf[key], expect[key],
          `agent conf for key ${key} was updated to expected value`)
      }

      // 5. Clean up and finish.
      agent.destroy()
      server.close()
      t.end()
    })
  })

  // 1. Start a mock APM Server.
  server.listen(function () {
    // 2. Start an agent.
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      logLevel: 'off', // silence for cleaner test output
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: true
    })
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
    log_level: 'warn'
  }
  const expect = {
    transactionSampleRate: 0.42,
    transactionMaxSpans: 99,
    captureBody: 'all',
    transactionIgnoreUrls: ['foo'],
    logLevel: 'warn'
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

// Tests for transaction_sample_rate precision from central config.
;[
  ['0', 0],
  ['0.0001', 0.0001],
  ['0.00002', 0.0001],
  ['0.300000002', 0.3],
  ['0.444444', 0.4444],
  ['0.555555', 0.5556],
  ['1', 1]
].forEach(function ([centralVal, expected]) {
  test(`central transaction_sample_rate precision: "${centralVal}"`, function (t) {
    runTestsWithServer(t,
      { transaction_sample_rate: centralVal },
      { transactionSampleRate: expected })
  })
})

// Ensure the logger updates if the central config `log_level` changes.
test('agent.logger updates for central config `log_level` change', { timeout: 1000 }, function (t) {
  let agent

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config with log_level=error.
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents',
      'mock apm-server got central config request')
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
    // 2. Start an agent with logLevel=warn.
    agent = new Agent().start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: true,
      logLevel: 'warn'
    })

    t.equal(agent.logger.level, 'warn',
      'immediately after .start() logger level should be the given "warn" level')
  })
})

// Ensure that a central config that updates some var other than `cloudProvider`
// does not result in *cloudProvider* being updated (issue #1976).
test('central config change does not erroneously update cloudProvider', { timeout: 1000 }, function (t) {
  let agent

  const server = http.createServer((req, res) => {
    // 3. The agent should fetch central config. We provide some non-empty
    //    config change that does not include `cloudProvider`.
    const url = new URL(req.url, 'relative:///')
    t.strictEqual(url.pathname, '/config/v1/agents',
      'mock apm-server got central config request')
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
