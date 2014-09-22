'use strict';

var util = require('util');
var https = require('https');
var zlib = require('zlib');
var os = require('os');

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

var getRequestOptions = function (client, buffer, endpoint) {
  return {
    method: 'POST',
    hostname: client.api.host,
    path: client.api.path + endpoint + '/',
    headers: {
      'Authorization': 'Bearer ' + client.secretToken,
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
      'User-Agent': userAgent
    }
  };
};

exports.error = function (client, body) {
  zlib.deflate(JSON.stringify(body), function (err, buffer) {
    if (err) return client.emit('error', err);

    var options = getRequestOptions(client, buffer, 'errors');
    var req = https.request(options, function (res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.resume();
        client.emit('logged', res.headers.location);
        return;
      }
      handleErrorResponse(client, res);
    });

    req.on('error', client.emit.bind(client, 'error'));
    req.end(buffer);
  });
};

exports.deployment = function (client, body, callback) {
  zlib.deflate(JSON.stringify(body), function (err, buffer) {
    if (err) return client.emit('error', err);

    var options = getRequestOptions(client, buffer, 'releases');
    var req = https.request(options, function (res) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (callback) callback();
        res.resume();
        return;
      }
      handleErrorResponse(client, res);
    });

    req.on('error', client.emit.bind(client, 'error'));
    req.end(buffer);
  });
};
