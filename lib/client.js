'use strict';

var http     = require('http');
var util     = require('util');
var events   = require('events');
var os       = require('os');
var exec     = require('child_process').exec;
var afterAll = require('after-all');
var parsers  = require('./parsers');
var request  = require('./request');

exports.version = require('../package.json').version;

exports.createClient = function (options) {
  return exports.client = new Client(options);
};

var log = function () {
  if (exports.client.silent) return;
  console.warn.apply(console, ['opbeat:'].concat(Array.prototype.slice.call(arguments)));
};

var Client = function (options) {
  options = options || {};

  this.app_id                = options.app_id          || process.env.OPBEAT_APP_ID;
  this.organization_id       = options.organization_id || process.env.OPBEAT_ORGANIZATION_ID;
  this.secret_token          = options.secret_token    || process.env.OPBEAT_SECRET_TOKEN;
  this.env                   = options.env             || process.env.NODE_ENV || 'development';
  this.logger                = options.logger;
  this.hostname              = options.hostname || os.hostname();
  this.stackTraceLimit       = options.stackTraceLimit || Infinity; // To infinity and beyond
  this.handleExceptions      = 'handleExceptions' in options ? options.handleExceptions : true;
  this.silent                = 'silent' in options ? !!options.silent : false;
  this.exceptionsAreCritical = 'exceptionsAreCritical' in options ? !!options.exceptionsAreCritical : true;
  this.dsn                   = {
    host: options.opbeatApiHostname || 'opbeat.com',
    path: '/api/v1/organizations/' + this.organization_id + '/apps/' + this.app_id + '/'
  };

  if (['development', 'test'].indexOf(this.env) !== -1) {
    console.warn('[WARNING] logging is disabled while running in %s mode', this.env);
    this._enabled = false;
  } else if (!this.app_id || !this.organization_id || !this.secret_token) {
    console.warn('[WARNING] logging is disabled. To enable, specify organization id, app id and opbeat token');
    this._enabled = false;
  } else {
    this._enabled = true;
  }

  if (this._enabled) {
    Error.stackTraceLimit = this.stackTraceLimit;

    if (this.handleExceptions) this.handleUncaughtExceptions();

    this.on('connectionError', function (err) {
      log('could not notify service.');
      log(err.stack);
    });
    this.on('error', function (err) {
      log('could not notify service.');
      log(err.stack);
    });
    this.on('logged', function (url) {
      log('logged error successfully at ' + url);
    });
  }
};
exports.Client = Client;
util.inherits(Client, events.EventEmitter);

Client.prototype.process = function (options, cb) {
  if (cb) {
    exports.client.once('error', cb);
    exports.client.once('connectionError', cb);
    exports.client.once('logged', function (url) {
      cb(null, url);
    });
  }

  options['machine'] = { hostname: exports.client.hostname };
  options['extra'] = options['extra'] || {};
  options['extra']['node'] = process.version;
  options['timestamp'] = new Date().toISOString().split('.')[0];
  if (exports.client.logger) options['logger'] = exports.client.logger;

  if (exports.client._enabled) request.error(this, options);
};

Client.prototype.captureMessage = function (message, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  } else if (!options) {
    options = {};
  } else if (options.request instanceof http.IncomingMessage) {
    options = parsers.parseRequest(options.request, options);
  }

  if (typeof message === 'object') {
    // if `captureMessage` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    options['param_message'] = message.message;
    // Format and send message as well
    options['message'] = util.format.apply(this, [message.message].concat(message.params));
    log.apply(undefined, [message.message].concat(message.params));
  } else {
    options = parsers.parseText(message, options);
    log(message);
  }
  exports.client.process(options, cb);
};

Client.prototype.captureError = function (err, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  } else if (!options) {
    options = {};
  } else if (options.request instanceof http.IncomingMessage) {
    options = parsers.parseRequest(options.request, options);
  }

  if (!(err instanceof Error)) {
    exports.client.captureMessage('Error: ' + err, options, cb);
    return;
  }

  parsers.parseError(err, options, function (options) {
    log(err.stack);
    exports.client.process(options, cb);
  });
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Client.prototype.handleUncaughtExceptions = function (callback) {
  process.on('uncaughtException', function (err) {
    log('caught unhandled exception');

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    exports.client.removeAllListeners();

    var options = {};
    if (exports.client.exceptionsAreCritical) options.level = 'fatal';
    exports.client.captureError(err, options, function (opbeatErr, url) {
      if (opbeatErr) {
        log('could not notify service.');
        log(opbeatErr.stack);
      } else {
        log('logged error successfully at ' + url);
      }
      callback ? callback(err) : process.exit(1);
    });
  });
};

Client.prototype.trackDeployment = function (options, callback) {
  if (typeof options === 'function') return exports.client.trackDeployment(null, options);

  var next = afterAll(function (err) {
    if (err) throw err;
    request.deployment(exports.client, options, callback);
  });

  if (!options) options = {};
  if (options.rev) return next()();
  if (!options.path) options.path = process.cwd();

  var cb1 = next(), cb2 = next();

  // TODO: Maybe there's a module for this:
  exec('cd ' + options.path + ' && git rev-parse HEAD', function (err, stdout, stderr) {
    if (!err) options.rev = stdout.toString().trim();
    cb1(err);
  });

  // TODO: Maybe there's a module for this:
  exec('cd ' + options.path + ' && git rev-parse --abbrev-ref HEAD', function (err, stdout, stderr) {
    if (!err) options.branch = stdout.toString().trim();
    cb2(err);
  });
};
