var parsers = require('./parsers');
var zlib = require('zlib');
var transports = require('./transports');
var util = require('util');
var events = require('events');
var os = require('os');
var raw = require('raw-stacktrace');

var traces = raw({rawCallSites: true});
traces.setMaxListeners(100);
traces.on("trace", function (err, callsites) { err.structuredStackTrace = callsites; });

module.exports.version = require('../package.json').version;

module.exports.createClient = function (options) {
  return module.exports.client = new Client(options);
};

var Client = function (options) {
    options = options || {};

    this.organization_id  = options.organization_id || process.env.OPBEAT_ORGANIZATION_ID;
    this.app_id           = options.app_id          || process.env.OPBEAT_APP_ID;
    this.secret_token     = options.secret_token    || process.env.OPBEAT_SECRET_TOKEN;
    this.env              = options.env             || process.env.NODE_ENV || 'development';
    this.logger           = options.logger;
    this.hostname         = options.hostname || os.hostname();
    this.stackTraceLimit  = options.stackTraceLimit || Infinity; // To infinity and beyond
    this.handleExceptions = 'handleExceptions' in options ? options.handleExceptions : true;
    this.silent           = 'silent' in options ? !!options.silent : false;
    this.dsn              = {
        protocol: 'https', // Opbeat currently only supports HTTPS. Future options might include HTTP and UDP
        host: 'opbeat.com',
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

        var client = this;
        this.on('connectionError', function (err) {
            if (client.silent) return;
            console.warn('opbeat: could not notify service.');
            console.warn('opbeat:', err.stack);
        });
        this.on('error', function (err) {
            if (client.silent) return;
            console.warn('opbeat: could not notify service.');
            console.warn('opbeat:', err.stack);
        });
        this.on('logged', function (url) {
            if (client.silent) return;
            console.warn('opbeat: logged error successfully at ' + url);
        });
    }
};
util.inherits(Client, events.EventEmitter);
var _ = Client.prototype;

_.process = function (kwargs, cb) {
    if (cb) {
        this.once('error', cb);
        this.once('connectionError', cb);
        this.once('logged', function (url) {
            cb(null, url);
        });
    }

    kwargs['machine'] = { hostname: this.hostname };
    kwargs['extra'] = kwargs['extra'] || {};
    kwargs['extra']['node'] = process.version;
    kwargs['timestamp'] = new Date().toISOString().split('.')[0];
    if (this.logger) kwargs['logger'] = this.logger;

    // this will happen asynchronously. We don't care about it's response.
    this._enabled && this.send(kwargs);
};

_.send = function (kwargs) {
    var client = this;
    zlib.deflate(JSON.stringify(kwargs), function (err, buff) {
        var headers = {
            'Authorization'  : 'Bearer ' + client.secret_token,
            'Content-Type'   : 'application/octet-stream',
            'Content-Length' : buff.length,
            'User-Agent'     : 'opbeat-nodejs/' + module.exports.version
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
    } else {
        kwargs = parsers.parseText(message, kwargs);
    }
    this.process(kwargs, cb);
};

_.captureError = function (err, kwargs, cb) {
    var client = this;

    if (!(err instanceof Error)) {
        // This handles when someone does:
        //   throw "something awesome";
        // We just send the "Error" as a normal message
        // since there is no way to compute a stack trace
        // See: https://github.com/mattrobenolt/raven-node/issues/18
        this.captureMessage('Error: ' + err, kwargs, cb);
        return;
    }

    if (!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }

    parsers.parseError(err, kwargs, function (kw) {
        client.process(kw, cb);
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
    this.captureError(err, kwargs, cb);
};

// The optional callback will be called with the error object after the
// error have been logged to Opbeat. If no callback have been provided
// we will automatically terminate the process, so if you provide a
// callback you must remember to terminate the process manually.
_.handleUncaughtExceptions = function (callback) {
    var client = this;

    process.on('uncaughtException', function (err) {
        if (!client.silent) {
            console.warn('opbeat: caught unhandled exception');
            console.warn('opbeat:', err.stack);
        }

        // Since we exit the node-process we cannot guarantee that the
        // listeners will be called, so to ensure a uniform result,
        // we'll remove all event listeners if an uncaught exception is
        // found
        client.removeAllListeners();

        client.captureError(err, function (opbeatErr, url) {
          if (!client.silent) {
              if (opbeatErr) {
                  console.warn('opbeat: could not notify service.');
                  console.warn('opbeat:', opbeatErr.stack);
              } else {
                  console.warn('opbeat: logged error successfully at ' + url);
              }
          }
          callback ? callback(err) : process.exit(1);
        });
    });
};
