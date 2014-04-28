'use strict';

var utils = require('./utils');
var url = require('url');

exports.parseText = function (message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};

exports.parseError = function (err, kwargs, cb) {
    err.stack; // Error.prepareStackTrace is only called when stack is accessed, so access it
    utils.parseStack(err.structuredStackTrace, function (frames) {
        kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
        // TODO: Consider using the exception.module property to specify
        // the names of node modules, if the error occured inside those
        kwargs['exception'] = {
            type  : err.name,
            value : err.message
        };

        kwargs['stacktrace'] = {frames: frames};

        // Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
        if (frames.length > 0) {
            kwargs['culprit'] = frames[0].function;
            for (var n = 0, l = frames.length; n < l; n++) {
                if (frames[n].in_app) {
                    kwargs['culprit'] = frames[n].function;
                    break;
                }
            }
        }

        cb(kwargs);
    });
};

exports.parseRequest = function (req, kwargs) {
    var protocol = req.socket.encrypted ? 'https' : 'http',
        host = req.headers.host || '<no host>';
    kwargs = kwargs || {};
    kwargs['http'] = {
        method       : req.method,
        query_string : url.parse(req.url).query,
        headers      : req.headers,
        cookies      : req.cookies || '<unavailable: use cookieParser middleware>',
        data         : req.body || '<unavailable: use bodyParser middleware>',
        url          : protocol + '://' + host + req.url,
        env          : process.env
    };
    return kwargs;
};
