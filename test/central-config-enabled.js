'use strict'

const existingValue = process.env.ELASTIC_APM_CENTRAL_CONFIG
delete process.env.ELASTIC_APM_CENTRAL_CONFIG

const { URL, parse: parseUrl } = require('url') // eslint-disable-line node/no-deprecated-api
const http = require('http')

const test = require('tape')

test('remote config enabled', function (t) {
  t.plan(2)

  let agent, timer
  const server = http.createServer((req, res) => {
    const url = URL ? new URL(req.url, 'relative:///') : parseUrl(req.url)
    t.equal(url.pathname, '/config/v1/agents')
    res.writeHead(200, {
      Etag: 1,
      'Cache-Control': 'max-age=30, must-revalidate'
    })
    res.end(JSON.stringify({
      transaction_sample_rate: 0.42
    }))
    clearTimeout(timer)
    agent.destroy()
    server.close()
  })

  server.listen(function () {
    agent = require('..').start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: true
    })

    Object.defineProperty(agent._conf, 'transactionSampleRate', {
      set (value) {
        t.equal(value, 0.42)
        t.end()
      },
      get () {},
      enumerable: true,
      configurable: true
    })

    timer = setTimeout(function () {
      t.fail('should poll APM Server for config')
    }, 1000)
  })

  t.on('end', function () {
    if (existingValue) process.env.ELASTIC_APM_CENTRAL_CONFIG = existingValue
  })
})
