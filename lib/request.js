'use strict';

var util = require('util');
var https = require('https');
var zlib = require('zlib');

var userAgent = 'opbeat-nodejs/' + require('../package.json').version;

module.exports = function (client, kwargs) {
  zlib.deflate(JSON.stringify(kwargs), function (err, body) {
    if (err) return client.emit('error', err);

    var options = {
      hostname: client.dsn.host,
      path: client.dsn.path,
      headers: {
        'Authorization'  : 'Bearer ' + client.secret_token,
        'Content-Type'   : 'application/octet-stream',
        'Content-Length' : body.length,
        'User-Agent'     : userAgent
      },
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
    req.end(body);
  });
};
