'use strict';

var opbeat = require('../client');
var parsers = require('../parsers');

module.exports = exports = function connectMiddleware (client) {
    client = (client instanceof opbeat.Client) ? client : opbeat.createClient(client);
    return function (err, req, res, next) {
        client.captureRequestError(err, req);
        next(err, req, res);
    };
};
