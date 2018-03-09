'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port + '/sub',
    captureExceptions: false
  })

  var http = require('http')
  var test = require('tape')

  test('should allow path in serverUrl', function (t) {
    var server = http.createServer(function (req, res) {
      t.equal(req.url, '/sub/v1/errors')
      res.end()
      server.close()
      t.end()
    })

    server.listen(port, function () {
      agent.captureError(new Error('foo'))
    })
  })
}, function (err) {
  throw err
})
