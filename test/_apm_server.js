'use strict'

var EventEmitter = require('events')
var http = require('http')
var util = require('util')
var zlib = require('zlib')

var getPort = require('get-port')
var HttpClient = require('elastic-apm-http-client')

var Agent = require('./_agent')
var pkg = require('../package.json')

var defaultAgentOpts = {
  serviceName: 'some-service-name',
  captureExceptions: false,
  logLevel: 'error'
}

module.exports = APMServer

util.inherits(APMServer, EventEmitter)

function APMServer (agentOpts, mockOpts) {
  if (!(this instanceof APMServer)) return new APMServer(agentOpts, mockOpts)
  var self = this
  mockOpts = mockOpts || {}

  this.agent = Agent()

  EventEmitter.call(this)

  getPort().then(function (port) {
    self.agent.start(Object.assign(
      {},
      defaultAgentOpts,
      { serverUrl: 'http://localhost:' + port },
      agentOpts
    ))

    var server = self.server = http.createServer(function (req, res) {
      self.emit('request', req, res)

      var buffers = []
      var gunzip = zlib.createGunzip()
      var unzipped = req.pipe(gunzip)

      unzipped.on('data', buffers.push.bind(buffers))
      unzipped.on('end', function () {
        res.end()
        if (mockOpts.skipClose !== true) {
          server.close()
        }
        var body = JSON.parse(Buffer.concat(buffers))
        if (mockOpts.forwardTo) {
          var client = new HttpClient({
            serverUrl: mockOpts.forwardTo,
            userAgent: 'elastic-apm-node/' + pkg.version
          })
          client.request('transactions', {}, body, () => {})
        }
        self.emit('body', body)
      })
    })

    self.emit('server', server)

    server.listen(port, function () {
      self.emit('listening', port)
    })
  })
}
