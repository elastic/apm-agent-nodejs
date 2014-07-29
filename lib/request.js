'use strict';

var util = require('util');
var https = require('https');

module.exports = function (client, message, headers) {
  var options = {
    hostname: client.dsn.host,
    path: client.dsn.path,
    headers: headers,
    method: 'POST',
    port: client.dsn.port || 443
  };

  var req = https.request(options, function (res) {
    var buffers = [];
    res.on('data', buffers.push.bind(buffers));
    res.on('end', function () {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        client.emit('logged', res.headers.location);
      } else {
        var body = Buffer.concat(buffers).toString('utf8');
        var msg = util.format('Opbeat error (%d): %s', res.statusCode, body);
        client.emit('error', new Error(msg));
      }
    });
  });

  req.on('error', client.emit.bind(client, 'connectionError'));
  req.end(message);
};
