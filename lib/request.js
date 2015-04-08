'use strict';

var util = require('util');

var request = function (client, endpoint, body, callback) {
  client._httpClient.request(endpoint, body, function (err, res, body) {
    if (err) {
      if (callback) callback(err);
      client.emit('error', err);
      return;
    }
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body);
      var err = new Error(msg);
      if (callback) callback(err);
      client.emit('error', err);
      return;
    }
    var url = res.headers.location;
    if (callback) callback(null, url);
    client.emit('logged', url);
  });
};

exports.error = function (client, body, callback) {
  request(client, 'errors', body, callback);
};

exports.release = function (client, body, callback) {
  request(client, 'releases', body, callback);
};
