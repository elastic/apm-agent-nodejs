'use strict'

var assert = require('assert')
var EventEmitter = require('events')
var http = require('http')
var util = require('util')
var zlib = require('zlib')

var getPort = require('get-port')
var ndjson = require('ndjson')

var Agent = require('./_agent')

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

  var requests = typeof mockOpts.expect === 'string'
    ? ['metadata', mockOpts.expect]
    : mockOpts.expect

  // ensure the expected types for each unique request to the APM Server is
  // nested in it's own array
  requests = Array.isArray(requests[0]) ? requests : [requests]

  this.agent = Agent()

  this.destroy = function () {
    this.server.close()
    this.agent.destroy()
  }

  EventEmitter.call(this)

  getPort().then(function (port) {
    self.agent.start(Object.assign(
      {},
      defaultAgentOpts,
      {serverUrl: 'http://localhost:' + port},
      agentOpts
    ))

    var server = self.server = http.createServer(function (req, res) {
      assert.equal(req.method, 'POST', `Unexpected HTTP method: ${req.method}`)
      assert.equal(req.url, '/v2/intake', `Unexpected HTTP url: ${req.url}`)

      self.emit('request', req, res)
      var expect = requests.shift()
      var index = 0

      req.pipe(zlib.createGunzip()).pipe(ndjson.parse()).on('data', function (data) {
        assert.equal(Object.keys(data).length, 1, `Expected number of root properties: ${Object.keys(data)}`)

        var type = Object.keys(data)[0]

        if (index === 0 && type !== 'metadata') assert.fail(`Unexpected data type at metadata index: ${type}`)
        if (index !== 0 && type === 'metadata') assert.fail(`Unexpected metadata index: ${index}`)
        if (expect) assert.equal(type, expect.shift(), `Unexpected type '${type}' at index ${index}`)

        self.emit('data', data, index)
        self.emit('data-' + type, data[type], index)

        index++
      })
    })

    self.emit('server', server)

    server.listen(port, function () {
      self.emit('listening', port)
    })
  })
}
