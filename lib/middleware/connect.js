var opbeat = require('../client');
var parsers = require('../parsers');

module.exports = function connectMiddleware(client) {
    client = (client instanceof opbeat.Client) ? client : new opbeat.Client(client);
    return function(err, req, res, next) {
        client.captureRequestError(err, req, function(result) {
            res.opbeat = client.getIdent(result);
            next(err, req, res);
        });
    };
};
