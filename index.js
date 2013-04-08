module.exports = require('./lib/client');
module.exports.middleware = {
    connect: require('./lib/middleware/connect')
};
// friendly alias for "opbeat.middleware.express"
module.exports.middleware.express = module.exports.middleware.connect;
