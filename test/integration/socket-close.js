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
      setTimeout(function () {
        server.close()
        t.end()
      }, 10)
    })

    server.listen(port, function () {
      agent.captureError(new Error('foo'))
    })
  })
}, function (err) {
  throw err
})
