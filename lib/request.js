'use strict'

var util = require('util')

var request = function (client, endpoint, data, cb) {
  client._httpClient.request(endpoint, data, function (err, res, body) {
    if (err) return cb(err)
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      cb(new Error(msg))
      return
    }
    cb(null, res.headers.location)
  })
}

exports.error = function (client, data, cb) {
  request(client, 'errors', data, function (err, url) {
    var uuid = data.extra && data.extra.uuid
    if (err) {
      if (cb) cb(err)
      client.emit('error', err, uuid)
      return
    }
    if (cb) cb(null, url)
    client.emit('logged', url, uuid)
  })
}

exports.transactions = function (client, data, cb) {
  request(client, 'transactions', data, function (err) {
    if (err) {
      if (cb) cb(err)
      client.emit('error', err)
      return
    }
    client.logger.trace('logged transactions successfully')
  })
}
