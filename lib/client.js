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
  console.warn.apply(console, arguments);
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
    console.warn('opbeat: [WARNING] logging is disabled while running in %s mode', this.env);
    this._enabled = false;
  } else if (!this.app_id || !this.organization_id || !this.secret_token) {
    console.warn('opbeat: [WARNING] logging is disabled. To enable, specify organization id, app id and opbeat token');
    this._enabled = false;
  } else {
    this._enabled = true;
  }

  if (this._enabled) {
    Error.stackTraceLimit = this.stackTraceLimit;

    if (this.handleExceptions) this.handleUncaughtExceptions();

    this.on('connectionError', function (err) {
      log('opbeat: could not notify service.');
      log('opbeat:', err.stack);
    });
    this.on('error', function (err) {
      log('opbeat: could not notify service.');
      log('opbeat:', err.stack);
    });
    this.on('logged', function (url) {
      log('opbeat: logged error successfully at ' + url);
    });
  }
};
exports.Client = Client;
util.inherits(Client, events.EventEmitter);

Client.prototype.process = function (kwargs, cb) {
  if (cb) {
    exports.client.once('error', cb);
    exports.client.once('connectionError', cb);
    exports.client.once('logged', function (url) {
      cb(null, url);
    });
  }

  kwargs['machine'] = { hostname: exports.client.hostname };
  kwargs['extra'] = kwargs['extra'] || {};
  kwargs['extra']['node'] = process.version;
  kwargs['timestamp'] = new Date().toISOString().split('.')[0];
  if (exports.client.logger) kwargs['logger'] = exports.client.logger;

  if (exports.client._enabled) request.error(this, kwargs);
};

Client.prototype.captureMessage = function (message, req, kwargs, cb) {
  if (req instanceof http.IncomingMessage) {
    kwargs = parsers.parseRequest(req, kwargs);
  } else {
    cb = kwargs;
    kwargs = req;
    req = undefined;
  }
  if (!cb && typeof kwargs === 'function') {
    cb = kwargs;
    kwargs = {};
  } else {
    kwargs = kwargs || {};
  }
  if (typeof message === 'object') {
    // if `captureMessage` is parsed an object instead of a string we except
    // it to be in the format of `{ message: '...', params: [] }` and it will
    // be used as `param_message`.
    kwargs['param_message'] = message.message;
    // Format and send message as well
    kwargs['message'] = util.format.apply(this, [message.message].concat(message.params));
    log.apply(undefined, ['opbeat: ' + message.message].concat(message.params));
  } else {
    kwargs = parsers.parseText(message, kwargs);
    log('opbeat: ' + message);
  }
  exports.client.process(kwargs, cb);
};

Client.prototype.captureError = function (err, kwargs, cb) {
  if (!(err instanceof Error)) {
    // This handles when someone does:
    //   throw "something awesome";
    // We just send the "Error" as a normal message
    // since there is no way to compute a stack trace
    // See: https://github.com/mattrobenolt/raven-node/issues/18
    exports.client.captureMessage('Error: ' + err, kwargs, cb);
    return;
  }

  if (!cb && typeof kwargs === 'function') {
    cb = kwargs;
    kwargs = {};
  } else {
    kwargs = kwargs || {};
  }

  parsers.parseError(err, kwargs, function (kw) {
    log('opbeat: ' + err.stack);
    exports.client.process(kw, cb);
  });
};

Client.prototype.captureRequestError = function (err, req, kwargs, cb) {
  if (!cb && typeof kwargs === 'function') {
    cb = kwargs;
    kwargs = {};
  } else {
    kwargs = kwargs || {};
  }

  kwargs = parsers.parseRequest(req, kwargs);
  exports.client.captureError(err, kwargs, cb);
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Client.prototype.handleUncaughtExceptions = function (callback) {
  process.on('uncaughtException', function (err) {
    log('opbeat: caught unhandled exception');

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    exports.client.removeAllListeners();

    var kwargs = {};
    if (exports.client.exceptionsAreCritical) kwargs.level = 'fatal';
    exports.client.captureError(err, kwargs, function (opbeatErr, url) {
      if (opbeatErr) {
        log('opbeat: could not notify service.');
        log('opbeat:', opbeatErr.stack);
      } else {
        log('opbeat: logged error successfully at ' + url);
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
