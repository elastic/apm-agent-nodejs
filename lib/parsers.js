'use strict';

var utils = require('./utils');
var url = require('url');
var stackback = require('stackback');

exports.parseText = function (message, kwargs) {
    kwargs = kwargs || {};
    kwargs['message'] = message;
    return kwargs;
};

exports.parseError = function (err, kwargs, cb) {
    var stack = stackback(err);
    utils.parseStack(stack, function (frames) {
        setMessage(kwargs, err);
        setException(kwargs, err);
        setStacktrace(kwargs, frames);
        setCulprint(kwargs, frames);
        setModule(kwargs, frames);
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

function setMessage(kwargs, err) {
    kwargs['message'] = err.name + ': ' + (err.message || '<no message>');
}

function setException(kwargs, err) {
    // TODO: Consider using the exception.module property to specify
    // the names of node modules, if the error occured inside those
    kwargs['exception'] = {
        type  : err.name,
        value : err.message
    };
}

function setStacktrace(kwargs, frames) {
    kwargs['stacktrace'] = { frames: frames };
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
function setCulprint(kwargs, frames) {
    if (!frames.length) return;
    kwargs['culprit'] = frames[0].function;
    for (var n = 0, l = frames.length; n < l; n++) {
        if (frames[n].in_app) {
            kwargs['culprit'] = frames[n].function;
            break;
        }
    }
};

function setModule(kwargs, frames) {
    var frame = frames[0];
    if (!frame || frame.in_app) return;
    var match = frame.filename.match(/node_modules\/([^\/]*)/);
    if (!match) return;
    kwargs.exception.module = match[1];
}
