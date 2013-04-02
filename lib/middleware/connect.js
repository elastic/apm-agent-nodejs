var opbeat = require('../client');
var parsers = require('../parsers');

module.exports = function connectMiddleware(client) {
    client = (client instanceof opbeat.Client) ? client : new opbeat.Client(client);
    return function(err, req, res, next) {
        var kwargs = parsers.parseRequest(req);
        client.captureError(err, kwargs, function(result) {
            res.opbeat = client.getIdent(result);
            next(err, req, res);
        });
    };
};
