'use strict';

var util = require('util');
var https = require('https');
var zlib = require('zlib');
var os = require('os');
var stringify = require('json-stringify-safe');

var userAgent = 'opbeat-nodejs/' + require('../package.json').version;

var handleErrorResponse = function (client, res, callback) {
  var buffers = [];
  res.on('data', buffers.push.bind(buffers));
  res.on('end', function () {
    var body = Buffer.concat(buffers).toString('utf8');
    var msg = util.format('Opbeat error (%d): %s', res.statusCode, body);
    var err = new Error(msg);
    if (callback) callback(err);
    client.emit('error', err);
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

exports.error = function (client, body, callback) {
  zlib.deflate(stringify(body), function (err, buffer) {
    if (err) {
      if (callback) callback(err);
      client.emit('error', err);
      return;
    }

    var options = getRequestOptions(client, buffer, 'errors');
    var req = https.request(options, function (res) {
      if (res.statusCode < 200 || res.statusCode > 299)
        return handleErrorResponse(client, res, callback);
      res.resume();
      var url = res.headers.location;
      if (callback) callback(null, url);
      client.emit('logged', url);
    });

    req.on('error', function (err) {
      if (callback) callback(err);
      client.emit('error', err);
    });

    req.end(buffer);
  });
};

exports.deployment = function (client, body, callback) {
  zlib.deflate(stringify(body), function (err, buffer) {
    if (err) {
      if (callback) callback(err);
      client.emit('error', err);
      return;
    }

    var options = getRequestOptions(client, buffer, 'releases');
    var req = https.request(options, function (res) {
      if (res.statusCode < 200 || res.statusCode > 299)
        return handleErrorResponse(client, res, callback);
      res.resume();
      if (callback) callback();
    });

    req.on('error', function (err) {
      if (callback) callback(err);
      client.emit('error', err);
    });

    req.end(buffer);
  });
};
