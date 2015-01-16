'use strict';

var os = require('os');

var OPTS_MATRIX = [
  ['appId', 'APP_ID'],
  ['organizationId', 'ORGANIZATION_ID'],
  ['secretToken', 'SECRET_TOKEN'],
  ['active', 'ACTIVE', true],
  ['clientLogLevel', 'CLIENT_LOG_LEVEL', 'info'],
  ['logger', 'LOGGER', function (opts) {
    return require('console-log-level')({ level: opts.clientLogLevel });
  }],
  ['hostname', 'HOSTNAME', os.hostname()],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', Infinity],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['exceptionLogLevel', 'EXCEPTION_LOG_LEVEL', 'fatal']
];

var BOOL_OPTS = [
  'active',
  'captureExceptions'
];

var normalizeBool = function (bool) {
  if (!bool) return false;
  switch (bool.toString().toLowerCase()) {
    case '0':
    case 'false':
    case 'no':
    case 'off':
    case 'disabled':
      return false;
    default:
      return true;
  }
};

module.exports = function (opts) {
  opts = opts || {};
  var result = {};

  OPTS_MATRIX.forEach(function (opt) {
    var key = opt[0];
    var env = 'OPBEAT_' + opt[1];
    var val;
    if (key in opts)
      val = opts[key];
    else if (env in process.env)
      val = process.env[env];
    else if (typeof opt[2] === 'function')
      val = opt[2](result);
    else if (opt.length === 3)
      val = opt[2];
    if (!!~BOOL_OPTS.indexOf(key))
      val = normalizeBool(val);
    if (val !== undefined)
      result[key] = val;
  });

  result.apiHost = opts._apiHost || 'opbeat.com';

  return result;
};
