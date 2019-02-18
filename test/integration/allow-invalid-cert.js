'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'https://localhost:' + port,
    disableInstrumentations: ['https'], // avoid the agent instrumenting the mock APM Server
    verifyServerCert: false,
    metricsInterval: 0
  })

  var https = require('https')
  var pem = require('https-pem')
  var test = require('tape')

  test('should allow self signed certificate', function (t) {
    t.plan(2)

    var server = https.createServer(pem, function (req, res) {
      t.pass('server received client request')
      res.end()
    })

    server.listen(port, function () {
      agent.captureError(new Error('boom!'), function () {
        t.pass('agent.captureError callback called')

        // The async execution order is different in Node.js 8 and below, so in
        // other to ensure that server request event fires in older versions of
        // Node before we end the test, we wrap this in a setImmediate
        setImmediate(function () {
          t.end()
          server.close()
          agent.destroy()
        })
      })
    })
  })
}, function (err) {
  throw err
})
