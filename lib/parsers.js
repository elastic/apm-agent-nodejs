'use strict';

var url = require('url');
var stackman = require('stackman')();

exports.parseText = function (message, kwargs) {
  kwargs = kwargs || {};
  kwargs['message'] = message;
  return kwargs;
};

exports.parseError = function (err, kwargs, cb) {
  stackman(err, function (stack) {
    setMessage(kwargs, err);
    setException(kwargs, err);
    setStacktrace(kwargs, stack);
    setCulprint(kwargs);
    setModule(kwargs);
    cb(kwargs);
  });
};

exports.parseRequest = function (req, kwargs) {
  var protocol = req.socket.encrypted ? 'https' : 'http',
      host = req.headers.host || '<no host>';
  kwargs = kwargs || {};
  kwargs.http = {
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
  kwargs.message = err.name + ': ' + (err.message || '<no message>');
}

function setException(kwargs, err) {
  kwargs.exception = {
    type  : err.name,
    value : err.message
  };
}

function setStacktrace(kwargs, stack) {
  kwargs.stacktrace = {
    frames: stack.map(function (callsite) {
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
function setCulprint(kwargs) {
  if (!kwargs.stacktrace.frames.length) return;
  kwargs.culprit = kwargs.stacktrace.frames[0].function;
  for (var n = 0, l = kwargs.stacktrace.frames.length; n < l; n++) {
    if (kwargs.stacktrace.frames[n].in_app) {
      kwargs['culprit'] = kwargs.stacktrace.frames[n].function;
      break;
    }
  }
};

function setModule(kwargs) {
  var frame = kwargs.stacktrace.frames[0];
  if (!frame || frame.in_app) return;
  var match = frame.filename.match(/node_modules\/([^\/]*)/);
  if (!match) return;
  kwargs.exception.module = match[1];
}
