'use strict'

var util = require('util')

var request = function (client, endpoint, body, cb) {
  client._httpClient.request(endpoint, body, function (err, res, body) {
    if (err) {
      if (cb) cb(err)
      client.emit('error', err)
      return
    }
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      err = new Error(msg)
      if (cb) cb(err)
      client.emit('error', err)
      return
    }
    var url = res.headers.location
    if (cb) cb(null, url)
    client.emit('logged', url)
  })
}

exports.error = function (client, body, cb) {
  request(client, 'errors', body, cb)
}

exports.release = function (client, body, cb) {
  request(client, 'releases', body, cb)
}
