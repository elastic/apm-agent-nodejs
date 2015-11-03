'use strict'

var util = require('util')

var request = function (agent, endpoint, data, cb) {
  agent._httpClient.request(endpoint, data, function (err, res, body) {
    if (err) return cb(err)
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      cb(new Error(msg))
      return
    }
    cb(null, res.headers.location)
  })
}

exports.error = function (agent, data, cb) {
  request(agent, 'errors', data, function (err, url) {
    var uuid = data.extra && data.extra.uuid
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err, uuid)
      return
    }
    if (cb) cb(null, url)
    agent.emit('logged', url, uuid)
  })
}

exports.transactions = function (agent, data, cb) {
  request(agent, 'transactions', data, function (err) {
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err)
      return
    }
    agent.logger.trace('logged transactions successfully')
  })
}
