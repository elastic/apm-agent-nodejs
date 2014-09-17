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

var logLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
var shouldLog = function (level) {
  return logLevels.indexOf(level) >= logLevels.indexOf(exports.client.level);
};
var log = {};
logLevels.forEach(function (level) {
  log[level] = function () {
    if (!shouldLog(level)) return;
    switch (level) {
      case 'debug': level = 'info'; break;
      case 'fatal': level = 'error'; break;
    }
    console[level].apply(console, arguments);
  };
});

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
  this.level                 = options.level || 'info'; // debug, info, error, warn, fatal
  this.exceptionsAreCritical = 'exceptionsAreCritical' in options ? !!options.exceptionsAreCritical : true;
  this.dsn                   = {
    host: options.opbeatApiHostname || 'opbeat.com',
    path: '/api/v1/organizations/' + this.organization_id + '/apps/' + this.app_id + '/'
  };

  if (['development', 'test'].indexOf(this.env) !== -1) {
    log.info('[WARNING] Opbeat logging is disabled while running in %s mode', this.env);
    this._enabled = false;
  } else if (!this.app_id || !this.organization_id || !this.secret_token) {
    log.info('[WARNING] Opbeat logging is disabled. To enable, specify organization id, app id and opbeat token');
    this._enabled = false;
  } else {
    this._enabled = true;
  }

  if (this._enabled) {
    Error.stackTraceLimit = this.stackTraceLimit;

    if (this.handleExceptions) this.handleUncaughtExceptions();

    this.on('connectionError', function (err) {
      log.info('Could not notify Opbeat!');
      log.error(err.stack);
    });
    this.on('error', function (err) {
      log.info('Could not notify Opbeat!');
      log.error(err.stack);
    });
    this.on('logged', function (url) {
      log.info('Opbeat logged error successfully at ' + url);
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

  options.machine = { hostname: exports.client.hostname };
  options.extra = options.extra || {};
  options.extra.node = process.version;
  options.timestamp = new Date().toISOString().split('.')[0];
  if (exports.client.logger) options.logger = exports.client.logger;

  if (exports.client._enabled) request.error(this, options);
};

// captureMessage is deprecated!
Client.prototype.captureError = Client.prototype.captureMessage = function (err, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  } else if (!options) {
    options = {};
  } else if (options.request instanceof http.IncomingMessage) {
    options = parsers.parseRequest(options.request, options);
  }

  if (!(err instanceof Error)) {
    var isMessage = true;
    parsers.parseMessage(err, options);
    log.error(options.message);
    err = new Error(options.message);
  }

  parsers.parseError(err, options, function (options) {
    if (isMessage) {
      // Messages shouldn't have an exception and the algorithm for finding the
      // culprit might show the Opbeat client and we don't want that
      delete options.exception;
      delete options.culprit;
      options.stacktrace.frames.pop();
    } else {
      log.error(err.stack);
    }
    exports.client.process(options, cb);
  });
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Client.prototype.handleUncaughtExceptions = function (callback) {
  process.on('uncaughtException', function (err) {
    log.debug('Opbeat caught unhandled exception');

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    exports.client.removeAllListeners();

    var options = {};
    if (exports.client.exceptionsAreCritical) options.level = 'fatal';
    exports.client.captureError(err, options, function (opbeatErr, url) {
      if (opbeatErr) {
        log.info('Could not notify Opbeat!');
        log.error(opbeatErr.stack);
      } else {
        log.info('Opbeat logged error successfully at ' + url);
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
