'use strict'

const existingValue = process.env.ELASTIC_APM_CENTRAL_CONFIG
delete process.env.ELASTIC_APM_CENTRAL_CONFIG

const { URL } = require('url')
const http = require('http')

const test = require('tape')

test('remote config enabled', function (t) {
  const updates = {
    transaction_sample_rate: '0.42',
    transaction_max_spans: '99',
    capture_body: 'all',
    transaction_ignore_urls: ['foo']
  }
  const expect = {
    transactionSampleRate: 0.42,
    transactionMaxSpans: 99,
    captureBody: 'all',
    transactionIgnoreUrls: ['foo']
  }
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
    agent = require('..').start({
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
})
