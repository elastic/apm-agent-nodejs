'use strict'

var util = require('util')

var request = function (client, endpoint, data, cb) {
  client._httpClient.request(endpoint, data, function (err, res, body) {
    if (err) {
      if (cb) cb(err)
      client.emit('error', err, data.extra.uuid)
      return
    }
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      err = new Error(msg)
      if (cb) cb(err)
      client.emit('error', err, data.extra.uuid)
      return
    }
    var url = res.headers.location
    if (cb) cb(null, url)
    client.emit('logged', url, data.extra.uuid)
  })
}

exports.error = function (client, data, cb) {
  request(client, 'errors', data, cb)
}
