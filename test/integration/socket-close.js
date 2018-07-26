'use strict'

var getPort = require('get-port')

getPort().then(function (port) {
  var agent = require('../../').start({
    serviceName: 'test',
    serverUrl: 'http://localhost:' + port,
    captureExceptions: false
  })

  var net = require('net')
  var test = require('tape')

  test('should not throw on socket close', function (t) {
    var server = net.createServer(function (socket) {
      socket.destroy()
    })

    server.listen(port, function () {
      agent.captureError(new Error('foo'), function (err) {
        t.equal(err.code, 'ECONNRESET')
        t.end()
        server.close()
      })
    })
  })
}, function (err) {
  throw err
})
