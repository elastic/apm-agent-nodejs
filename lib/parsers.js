'use strict';

var url = require('url');
var util = require('util');
var stackman = require('stackman')();
var stringify = require('json-stringify-safe');

exports.parseMessage = function (message, options) {
  if (typeof message === 'object') {
    // if `captureError` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    if (message.message) {
      options.param_message = message.message;
      message = util.format.apply(this, [message.message].concat(message.params));
    } else {
      message = util.inspect(message);
    }
  }

  options.message = message;
};

exports.parseError = function (err, options, callback) {
  stackman(err, function (stack) {
    setMessage(options, err);
    setException(options, err);
    setStacktrace(options, stack.frames);
    setCulprint(options, stack.frames);
    setModule(options);
    setExtraProperties(options, stack.properties);
    callback(options);
  });
};

exports.parseRequest = function (req, options) {
  var protocol = req.socket.encrypted ? 'https' : 'http',
      host = req.headers.host || '<no host>',
      userAgent = req.headers['user-agent'];
  options = options || {};
  options.http = {
    method       : req.method,
    url          : protocol + '://' + host + req.url,
    query_string : url.parse(req.url).query,
    headers      : req.headers,
    secure       : req.socket.encrypted,
    remote_host  : req.socket.remoteAddress,
    data         : req.json || req.body || '<unavailable: use bodyParser middleware>'
  };
  if (typeof options.http.data !== 'string') options.http.data = stringify(options.http.data);
  if (req.cookies) options.http.cookies = req.cookies;
  if (userAgent) options.http.user_agent = userAgent;
  return options;
};

function setMessage(options, err) {
  // If the message have already been set, for instance when calling
  // `captureError` with a string or an object-literal, just return without
  // overwriting it
  if (options.message) return;
  // TODO: Normally err.name is just "Error", maybe we should omit it in that case?
  options.message = err.name + ': ' + (err.message || '<no message>');
}

function setException(options, err) {
  options.exception = {
    type  : err.name,
    value : err.message
  };
}

function setStacktrace(options, frames) {
  options.stacktrace = {
    frames: frames.map(function (callsite) {
      var filename = callsite.getFileName();
      var frame = {
        filename   : callsite.getRelativeFileName() || '',
        lineno     : callsite.getLineNumber(),
        'function' : callsite.getFunctionNameSanitized(),
        in_app     : callsite.isApp()
      };
      if (!Number.isFinite(frame.lineno)) frame.lineno = 0; // this should be an int, but sometimes it's not?!
      if (filename) frame.abs_path = filename;

      if ('context' in callsite) {
        frame.pre_context = callsite.context.pre;
        frame.context_line = callsite.context.line;
        frame.post_context = callsite.context.post;
      }

      return frame;
    })
  };
}

// Default `culprit` to the top of the stack or the highest `in_app` frame if such exists
function setCulprint(options, frames) {
  if (!frames.length) return;
  var filename = frames[0].getRelativeFileName();
  var fnName = frames[0].getFunctionNameSanitized();
  for (var n = 0, l = frames.length; n < l; n++) {
    if (frames[n].in_app) {
      filename = frames[n].getRelativeFileName();
      fnName = frames[n].getFunctionNameSanitized();
      break;
    }
  }
  options.culprit = filename ? fnName + ' (' + filename + ')' : fnName;
};

function setModule(options) {
  var frame = options.stacktrace.frames[0];
  if (!frame || frame.in_app) return;
  var match = frame.filename.match(/node_modules\/([^\/]*)/);
  if (!match) return;
  options.exception.module = match[1];
}

function setExtraProperties(options, properties) {
  var keys = Object.keys(properties || {});
  if (!keys.length) return;
  options.extra = options.extra || {};
  keys.forEach(function (key) {
    if (key in options.extra) return;
    options.extra[key] = properties[key];
  });
}
