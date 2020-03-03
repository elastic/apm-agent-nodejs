'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'https://localhost:' + port,
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    disableInstrumentations: ['https'], // avoid the agent instrumenting the mock APM Server
    verifyServerCert: false
  })

  var https = require('https')
  var pem = require('https-pem')
  var test = require('tape')

  test('should allow self signed certificate', function (t) {
    t.plan(3)

    var server = https.createServer(pem, function (req, res) {
      t.pass('server received client request')
      res.end()
    })

    server.listen(port, function () {
      agent.captureError(new Error('boom!'), function (err) {
        t.error(err)
        t.pass('agent.captureError callback called')
        server.close()
        agent.destroy()
      })
    })
  })
}, function (err) {
  throw err
})
