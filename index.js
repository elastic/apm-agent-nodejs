'use strict';

var http = require('http');
var util = require('util');
var events = require('events');
var exec = require('child_process').exec;
var afterAll = require('after-all');
var config = require('./lib/config');
var parsers = require('./lib/parsers');
var request = require('./lib/request');
var connect = require('./lib/middleware/connect');

var Client = function (options) {
  if (!(this instanceof Client))
    return new Client(options);

  var client = this;

  options = config(options);
  this.appId = options.appId;
  this.organizationId = options.organizationId;
  this.secretToken = options.secretToken;
  this.active = options.active;
  this.clientLogLevel = options.clientLogLevel;
  this.logger = options.logger;
  this.hostname = options.hostname;
  this.stackTraceLimit = options.stackTraceLimit;
  this.captureExceptions = options.captureExceptions;
  this.exceptionLogLevel = options.exceptionLogLevel;
  this.api = {
    host: options.apiHost,
    path: '/api/v1/organizations/' + options.organizationId + '/apps/' + options.appId + '/'
  };

  connect = connect.bind(this);
  this.middleware = { connect: connect, express: connect };

  if (!this.active) {
    this.logger.info('Opbeat logging is disabled for now');
    return;
  } else if (!this.appId || !this.organizationId || !this.secretToken) {
    this.logger.info('[WARNING] Opbeat logging is disabled. To enable, specify organization id, app id and secret token');
    this.active = false;
    return;
  }

  Error.stackTraceLimit = this.stackTraceLimit;
  if (this.captureExceptions) this.handleUncaughtExceptions();

  this.on('error', this._internalErrorLogger);
  this.on('logged', function (url) {
    client.logger.info('Opbeat logged error successfully at ' + url);
  });
};
util.inherits(Client, events.EventEmitter);

Client.prototype._internalErrorLogger = function (err) {
  this.logger.info('Could not notify Opbeat!');
  this.logger.error(err.stack);
};

Client.prototype.captureError = function (err, options, callback) {
  var client = this;
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (!options) {
    options = {};
  } else if (options.request instanceof http.IncomingMessage) {
    options = parsers.parseRequest(options.request, options);
    delete options.request;
  }

  var level = options.exceptionLogLevel || 'error';
  level = level === 'warning' ? 'warn' : level;

  if (!util.isError(err)) {
    var isMessage = true;
    parsers.parseMessage(err, options);
    this.logger[level](options.message);
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
      client.logger[level](err.stack);
    }

    options.stacktrace.frames.reverse(); // opbeat expects frames in reverse order
    options.machine = { hostname: client.hostname };
    options.extra = options.extra || {};
    options.extra.node = process.version;
    options.timestamp = new Date().toISOString().split('.')[0];

    if (client.active) request.error(client, options, callback);
  });
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
Client.prototype.handleUncaughtExceptions = function (callback) {
  var client = this;

  if (this._uncaughtExceptionListener)
    process.removeListener('uncaughtException', this._uncaughtExceptionListener);

  this._uncaughtExceptionListener = function (err) {
    client.logger.debug('Opbeat caught unhandled exception');

    // Since we exit the node-process we cannot guarantee that the
    // listeners will be called, so to ensure a uniform result,
    // we'll remove all event listeners if an uncaught exception is
    // found
    client.removeAllListeners();
    // But make sure emitted errors doesn't cause yet another uncaught
    // exception
    client.on('error', client._internalErrorLogger);

    err.uncaught = true;

    var options = {
      level: client.exceptionLogLevel
    };
    client.captureError(err, options, function (opbeatErr, url) {
      if (opbeatErr) {
        client.logger.info('Could not notify Opbeat!');
        client.logger.error(opbeatErr.stack);
      } else {
        client.logger.info('Opbeat logged error successfully at ' + url);
      }
      callback ? callback(err, url) : process.exit(1);
    });
  };

  process.on('uncaughtException', this._uncaughtExceptionListener);
};

Client.prototype.trackDeployment = function (options, callback) {
  if (typeof options === 'function') return this.trackDeployment(null, options);

  var client = this;
  var next = afterAll(function (err) {
    if (err) throw err;
    request.deployment(client, body, callback);
  });

  if (!options) options = {};

  var body = {
    status: options.status || 'completed',
    rev: options.rev,
    branch: options.branch
  };

  if (body.rev) return next()();
  if (!options.path) options.path = process.cwd();

  var cb1 = next(), cb2 = next();

  // TODO: Maybe there's a module for this:
  exec('cd ' + options.path + ' && git rev-parse HEAD', function (err, stdout, stderr) {
    if (!err) body.rev = stdout.toString().trim();
    cb1(err);
  });

  // TODO: Maybe there's a module for this:
  exec('cd ' + options.path + ' && git rev-parse --abbrev-ref HEAD', function (err, stdout, stderr) {
    if (!err) body.branch = stdout.toString().trim();
    cb2(err);
  });
};

module.exports = Client;
