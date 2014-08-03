'use strict';

var url = require('url');
var stackman = require('stackman')();

exports.parseText = function (message, kwargs) {
  kwargs = kwargs || {};
  kwargs.message = message;
  return kwargs;
};

exports.parseError = function (err, kwargs, cb) {
  stackman(err, function (stack) {
    setMessage(kwargs, err);
    setException(kwargs, err);
    setStacktrace(kwargs, stack.frames);
    setCulprint(kwargs, stack.frames);
    setModule(kwargs);
    setExtraProperties(kwargs, stack.properties);
    cb(kwargs);
  });
};

exports.parseRequest = function (req, kwargs) {
  var protocol = req.socket.encrypted ? 'https' : 'http',
      host = req.headers.host || '<no host>';
  kwargs = kwargs || {};
  kwargs.http = {
    method       : req.method,
    url          : protocol + '://' + host + req.url,
    query_string : url.parse(req.url).query,
    headers      : req.headers,
    data         : req.body || '<unavailable: use bodyParser middleware>',
    env          : process.env
  };
  if (req.cookies) kwargs.http.cookies = req.cookies;
  return kwargs;
};

function setMessage(kwargs, err) {
  kwargs.message = err.name + ': ' + (err.message || '<no message>');
}

function setException(kwargs, err) {
  kwargs.exception = {
    type  : err.name,
    value : err.message
  };
}

function setStacktrace(kwargs, frames) {
  kwargs.stacktrace = {
    frames: frames.map(function (callsite) {
      var frame = {
          filename   : callsite.getFileName() || '',
          lineno     : callsite.getLineNumber(),
          'function' : callsite.getFunctionNameSanitized(),
          in_app     : callsite.isApp()
      };

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
function setCulprint(kwargs, frames) {
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
  kwargs.culprit = filename ? fnName + ' (' + filename + ')' : fnName;
};

function setModule(kwargs) {
  var frame = kwargs.stacktrace.frames[0];
  if (!frame || frame.in_app) return;
  var match = frame.filename.match(/node_modules\/([^\/]*)/);
  if (!match) return;
  kwargs.exception.module = match[1];
}

function setExtraProperties(kwargs, properties) {
  var keys = Object.keys(properties || {});
  if (!keys.length) return;
  kwargs.extra = kwargs.extra || {};
  keys.forEach(function (key) {
    if (key in kwargs.extra) return;
    kwargs.extra[key] = properties[key];
  });
}
