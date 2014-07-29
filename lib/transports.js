'use strict';

var util = require('util');

var http = require('http');
var HTTPTransport = function () {
  // Opbeat currently doesn't support HTTP
  this.defaultPort = 80;
  this.transport = http;
}
HTTPTransport.prototype.send = function (client, message, headers) {
  var options = {
    hostname: client.dsn.host,
    path: client.dsn.path,
    headers: headers,
    method: 'POST',
    port: client.dsn.port || this.defaultPort
  }, req = this.transport.request(options, function (res) {
    var buffers = [];
    res.on('data', buffers.push.bind(buffers));
    res.on('end', function () {
      if(res.statusCode >= 200 && res.statusCode < 300) {
        client.emit('logged', res.headers.location);
      } else {
        var body = Buffer.concat(buffers).toString('utf8');
        var msg = util.format('Opbeat error (%d): %s', res.statusCode, body);
        client.emit('error', new Error(msg));
      }
    });
  });
  req.on('error', function (err) {
    client.emit('connectionError', err);
  });
  req.end(message);
}

var https = require('https');
var HTTPSTransport = function () {
  this.defaultPort = 443;
  this.transport = https;
}
util.inherits(HTTPSTransport, HTTPTransport);

exports.https = new HTTPSTransport();
