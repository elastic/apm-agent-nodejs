'use strict'

const existingValue = process.env.ELASTIC_APM_CENTRAL_CONFIG
delete process.env.ELASTIC_APM_CENTRAL_CONFIG

const http = require('http')

const test = require('tap').test

test('central config disabled', function (t) {
  const server = http.createServer((req, res) => {
    t.notOk(req.url.startsWith('/config/v1/agents'), `should not poll APM Server for config (url: ${req.url})`)
  })

  server.listen(function () {
    const agent = require('..').start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      centralConfig: false
    })

    setTimeout(function () {
      t.pass('should not poll APM Server for config')
      t.end()
      agent.destroy()
      server.close()
    }, 1000)
  })

  t.on('end', function () {
    if (existingValue) process.env.ELASTIC_APM_CENTRAL_CONFIG = existingValue
  })
})
