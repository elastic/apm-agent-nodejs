'use strict';

var util = require('util');
var https = require('https');
var zlib = require('zlib');
var os = require('os');
var querystring = require('querystring');

var userAgent = 'opbeat-nodejs/' + require('../package.json').version;

var handleErrorResponse = function (client, res) {
  var buffers = [];
  res.on('data', buffers.push.bind(buffers));
  res.on('end', function () {
    var body = Buffer.concat(buffers).toString('utf8');
    var msg = util.format('Opbeat error (%d): %s', res.statusCode, body);
    client.emit('error', new Error(msg));
  });
};

exports.error = function (client, kwargs) {
  zlib.deflate(JSON.stringify(kwargs), function (err, body) {
    if (err) return client.emit('error', err);

    var options = {
      method: 'POST',
      hostname: client.dsn.host,
      path: client.dsn.path + 'errors/',
      headers: {
        'Authorization': 'Bearer ' + client.secret_token,
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length,
        'User-Agent': userAgent
      }
    };

    var req = https.request(options, function (res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.resume();
        client.emit('logged', res.headers.location);
        return;
      }
      handleErrorResponse(client, res);
    });

    req.on('error', client.emit.bind(client, 'connectionError'));
    req.end(body);
  });
};

exports.deployment = function (client, options, callback) {
  var params = {
    rev: options.rev,
    status: options.status || 'completed',
    hostname: options.hostname || os.hostname()
  };
  if (options.branch) params.branch = options.branch;

  var body = querystring.stringify(params);

  var httpOptions = {
    method: 'POST',
    hostname: client.dsn.host,
    path: client.dsn.path + 'deployments/',
    headers: {
      'Authorization': 'Bearer ' + client.secret_token,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': userAgent
    }
  };

  var req = https.request(httpOptions, function (res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (callback) callback();
      res.resume();
      return;
    }
    handleErrorResponse(client, res);
  });

  req.on('error', client.emit.bind(client, 'connectionError'));
  req.end(body);
};
