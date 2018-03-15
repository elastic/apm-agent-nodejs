'use strict'

var EventEmitter = require('events')
var http = require('http')
var util = require('util')
var zlib = require('zlib')

var getPort = require('get-port')

var Agent = require('./_agent')

var defaultAgentOpts = {
  serviceName: 'some-service-name',
  captureExceptions: false,
  logLevel: 'error'
}

module.exports = APMServer

util.inherits(APMServer, EventEmitter)

function APMServer (agentOpts) {
  if (!(this instanceof APMServer)) return new APMServer(agentOpts)
  var self = this

  this.agent = Agent()

  EventEmitter.call(this)

  getPort().then(function (port) {
    self.agent.start(Object.assign(
      {},
      defaultAgentOpts,
      {serverUrl: 'http://localhost:' + port},
      agentOpts
    ))

    var server = http.createServer(function (req, res) {
      self.emit('request', req, res)

      var buffers = []
      var gunzip = zlib.createGunzip()
      var unzipped = req.pipe(gunzip)

      unzipped.on('data', buffers.push.bind(buffers))
      unzipped.on('end', function () {
        res.end()
        server.close()
        self.emit('body', JSON.parse(Buffer.concat(buffers)))
      })
    })

    self.emit('server', server)

    server.listen(port, function () {
      self.emit('listening', port)
    })
  })
}
