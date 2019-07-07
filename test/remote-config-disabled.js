'use strict'

const http = require('http')

const test = require('tape')

test('remote config disabled', function (t) {
  const server = http.createServer((req, res) => {
    t.fail('should not poll APM Server for config')
  })

  server.listen(function () {
    const agent = require('..').start({
      serverUrl: 'http://localhost:' + server.address().port,
      serviceName: 'test',
      captureExceptions: false,
      metricsInterval: 0,
      remoteConfig: false
    })

    setTimeout(function () {
      t.pass('should not poll APM Server for config')
      t.end()
      agent.destroy()
      server.close()
    }, 1000)
  })
})
