var utils = require('./utils');
var compat = require('./compat');
var url = require('url');

module.exports.parseText = function parseText(message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};

module.exports.parseError = function parseError(err, kwargs, cb) {
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(error, frames) { return arguments; };
    // prepareStackTrace is triggered the first time .stack is accessed
    // so this is explicitly triggering it
    var stackArguments = err.stack;
    err.stack = compat.FormatStackTrace(stackArguments[0], stackArguments[1]);
    var stack = stackArguments[1];

    utils.parseStack(stack, function(frames) {
        kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
        kwargs['exception'] = {
            type: err.name,
            value:err.message
        };

        kwargs['stacktrace'] = {frames: frames};

        for (var n = 0, l = frames.length; n < l; n++) {
            if (frames[n].in_app) {
                kwargs['culprit'] = frames[n].function;
                break;
            }
        }

        cb(kwargs);
    });
};

module.exports.parseRequest = function parseRequest(req, kwargs) {
    kwargs = kwargs || {};
    kwargs['http'] = {
        method: req.method,
        query_string: url.parse(req.url).query,
        headers: req.headers,
        cookies: req.cookies || '<unavailable: use cookieParser middleware>',
        data: req.body || '<unavailable: use bodyParser middleware>',
        url: (function build_absolute_url() {
            var protocol = req.socket.encrypted ? 'https' : 'http',
                host = req.headers.host || '<no host>';
            return protocol+'://'+host+req.url;
        }()),
        env: process.env
    };
    return kwargs;
};
