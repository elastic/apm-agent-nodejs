'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'https://localhost:' + port,
    validateServerCert: false
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
        server.close()
        t.pass('agent.captureError callback called')
      })
    })
  })
}, function (err) {
  throw err
})
