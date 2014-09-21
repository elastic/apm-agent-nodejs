'use strict';

var http     = require('http');
var util     = require('util');
var events   = require('events');
var os       = require('os');
var exec     = require('child_process').exec;
var afterAll = require('after-all');
var parsers  = require('./parsers');
var request  = require('./request');
var log      = require('./logger');

module.exports = function (options) {
  if (module.exports._client) return module.exports._client;
  return module.exports._client = new Client(options);
};

var Client = function (options) {
  options = options || {};

  this.app_id                = options.app_id          || process.env.OPBEAT_APP_ID;
  this.organization_id       = options.organization_id || process.env.OPBEAT_ORGANIZATION_ID;
  this.secret_token          = options.secret_token    || process.env.OPBEAT_SECRET_TOKEN;
  this.active                = options.active != false;
  this.level                 = options.level || 'info'; // debug, info, error, warn, fatal
  this.hostname              = options.hostname || os.hostname();
  this.stackTraceLimit       = 'stackTraceLimit' in options ? options.stackTraceLimit : Infinity;
  this.handleExceptions      = options.handleExceptions != false;
  this.exceptionsAreCritical = options.exceptionsAreCritical != false;
  this.api                   = {
    host: options.apiHost || 'opbeat.com',
    path: '/api/v1/organizations/' + this.organization_id + '/apps/' + this.app_id + '/'
  };

  log.setLevel(this.level);

  if (!this.active) {
    log.info('Opbeat logging is disabled for now');
  } else if (!this.app_id || !this.organization_id || !this.secret_token) {
    log.info('[WARNING] Opbeat logging is disabled. To enable, specify organization id, app id and secret token');
    this.active = false;
  }

  if (!this.active) return;

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
};
util.inherits(Client, events.EventEmitter);

module.exports.version = Client.prototype.version = require('../package.json').version;

Client.prototype.middleware = {
  connect: require('./middleware/connect'),
  express: require('./middleware/connect')
};

Client.prototype.process = function (options, cb) {
  if (cb) {
    this.once('error', cb);
    this.once('connectionError', cb);
    this.once('logged', function (url) {
      cb(null, url);
    });
  }

  options.machine = { hostname: this.hostname };
  options.extra = options.extra || {};
  options.extra.node = process.version;
  options.timestamp = new Date().toISOString().split('.')[0];

  if (this.active) request.error(this, options);
};

Client.prototype.captureError = function (err, options, cb) {
  var client = this;
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
      options.stacktrace.frames.shift();
    } else {
      log.error(err.stack);
    }
    client.process(options, cb);
  });
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Client.prototype.handleUncaughtExceptions = function (callback) {
  var client = this;
  process.on('uncaughtException', function (err) {
    log.debug('Opbeat caught unhandled exception');

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    client.removeAllListeners();

    var options = {};
    if (client.exceptionsAreCritical) options.level = 'fatal';
    client.captureError(err, options, function (opbeatErr, url) {
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
  if (typeof options === 'function') return this.trackDeployment(null, options);

  var client = this;
  var next = afterAll(function (err) {
    if (err) throw err;
    request.deployment(client, options, callback);
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
