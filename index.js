'use strict';

module.exports = exports = require('./lib/client');
exports.middleware = {
    connect: require('./lib/middleware/connect')
};
// friendly alias for "opbeat.middleware.express"
exports.middleware.express = exports.middleware.connect;
