'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port + '/sub',
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    disableInstrumentations: ['http'] // avoid the agent instrumenting the mock APM Server
  })

  var http = require('http')
  var test = require('tape')

  test('should allow path in serverUrl', function (t) {
    var server = http.createServer(function (req, res) {
      t.strictEqual(req.url, '/sub/intake/v2/events')
      res.end()
      t.end()
      server.close()
      agent.destroy()
    })

    server.listen(port, function () {
      agent.captureError(new Error('foo'))
    })
  })
}, function (err) {
  throw err
})
