'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false
  })

  var http = require('http')
  var test = require('tape')

  test('should not throw on 503', function (t) {
    var server = http.createServer(function (req, res) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end('{"error":"something"}')
    })

    // because of keep-alive
    server.on('connection', function (socket) {
      socket.unref()
    })

    server.listen(port, function () {
      agent.captureError(new Error('foo'), function (err) {
        t.error(err)
        t.end()
        server.close()
      })
    })
  })
}, function (err) {
  throw err
})
