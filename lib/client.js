'use strict';

var zlib       = require('zlib');
var util       = require('util');
var events     = require('events');
var os         = require('os');
var raw        = require('raw-stacktrace');
var parsers    = require('./parsers');
var transports = require('./transports');

var traces = raw({ rawCallSites: true });
traces.setMaxListeners(100);
traces.on("trace", function (err, callsites) {
  err.structuredStackTrace = callsites;
});

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

    this.organization_id       = options.organization_id || process.env.OPBEAT_ORGANIZATION_ID;
    this.app_id                = options.app_id          || process.env.OPBEAT_APP_ID;
    this.secret_token          = options.secret_token    || process.env.OPBEAT_SECRET_TOKEN;
    this.env                   = options.env             || process.env.NODE_ENV || 'development';
    this.logger                = options.logger;
    this.hostname              = options.hostname || os.hostname();
    this.stackTraceLimit       = options.stackTraceLimit || Infinity; // To infinity and beyond
    this.handleExceptions      = 'handleExceptions' in options ? options.handleExceptions : true;
    this.silent                = 'silent' in options ? !!options.silent : false;
    this.exceptionsAreCritical = 'exceptionsAreCritical' in options ? !!options.exceptionsAreCritical : true;
    this.dsn                   = {
        protocol: 'https', // Opbeat currently only supports HTTPS. Future options might include HTTP and UDP
        host: options.opbeatApiHostname || 'opbeat.com',
        path: '/api/v1/organizations/' + this.organization_id + '/apps/' + this.app_id + '/errors/'
    };

    if (['development', 'test'].indexOf(this.env) !== -1) {
        console.warn('opbeat: [WARNING] logging is disabled while running in %s mode', this.env);
        this._enabled = false;
    } else if (!this.organization_id || !this.app_id || !this.secret_token) {
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
var _ = Client.prototype;

_.process = function (kwargs, cb) {
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

    // this will happen asynchronously. We don't care about its response.
    exports.client._enabled && exports.client.send(kwargs);
};

_.send = function (kwargs) {
    var client = this;
    zlib.deflate(JSON.stringify(kwargs), function (err, buff) {
        var headers = {
            'Authorization'  : 'Bearer ' + client.secret_token,
            'Content-Type'   : 'application/octet-stream',
            'Content-Length' : buff.length,
            'User-Agent'     : 'opbeat-nodejs/' + exports.version
        };
        transports[client.dsn.protocol].send(client, buff, headers);
    });
};

_.captureMessage = function (message, kwargs, cb) {
    if (!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    if (typeof message === 'object') {
        // if `captureMessage` is parsed an object instead of a string we except
        // it to be in the format of `{ message: '...', params: [] }` and it will
        // be used as `param_message` instead of `message`
        kwargs['param_message'] = message;
        log.apply(undefined, ['opbeat: ' + message.message].concat(message.params));
    } else {
        kwargs = parsers.parseText(message, kwargs);
        log('opbeat: ' + message);
    }
    exports.client.process(kwargs, cb);
};

_.captureError = function (err, kwargs, cb) {
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

    log('opbeat: ' + err.stack);
    parsers.parseError(err, kwargs, function (kw) {
        exports.client.process(kw, cb);
    });
};

_.captureRequestError = function (err, req, kwargs, cb) {
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
_.handleUncaughtExceptions = function (callback) {
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
