var parsers = require('./parsers');
var zlib = require('zlib');
var transports = require('./transports');
var util = require('util');
var events = require('events');
var os = require('os');

module.exports.version = require('../package.json').version;

var Client = function (options) {
    options = options || {};

    this.org_id           = options.organization_id || process.env.OPBEAT_ORGANIZATION_ID;
    this.app_id           = options.app_id          || process.env.OPBEAT_APP_ID;
    this.secret_token     = options.secret_token    || process.env.OPBEAT_SECRET_TOKEN;
    this.env              = options.env             || process.env.NODE_ENV || 'development';
    this.loggerName       = options.logger || '';
    this.hostname         = options.hostname || os.hostname();
    this.handleExceptions = 'handleExceptions' in options ? options.handleExceptions : true;
    this.dsn              = {
        protocol: 'https', // Opbeat currently only supports HTTPS. Future options might include HTTP and UDP
        host: 'opbeat.com',
        path: '/api/v1/organizations/' + this.org_id + '/apps/' + this.app_id + '/errors/'
    };

    if (['development', 'test'].indexOf(this.env) !== -1) {
        console.warn('Warning: Opbeat logging is disabled while running in %s mode', this.env);
        this._enabled = false;
    } else if (!this.org_id || !this.app_id || !this.secret_token) {
        console.warn('Warning: Opbeat logging is disabled. To enable, specify organization id, app id and opbeat token');
        this._enabled = false;
    } else {
        this._enabled = true;
    }

    if (this._enabled && this.handleExceptions) {
        this.handleUncaughtExceptions();
    }

    this.on('error', function () {});  // noop
};
util.inherits(Client, events.EventEmitter);
var _ = Client.prototype;

module.exports.Client = Client;

_.process = function (kwargs, cb) {
    if (cb) {
        this.once('error', cb);
        this.once('logged', function (url) {
            cb(null, url);
        });
    }

    kwargs['machine'] = { hostname: this.hostname };
    kwargs['extra'] = kwargs['extra'] || {};
    kwargs['extra']['node'] = process.version;
    kwargs['logger'] = this.loggerName;
    kwargs['timestamp'] = new Date().toISOString().split('.')[0];

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
    this.process(parsers.parseText(message, kwargs), cb);
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

_.handleUncaughtExceptions = function (callback) {
    var client = this;

    callback = callback || function (opbeatErr, url) {
        if (opbeatErr) {
            util.log('Could not send error to Opbeat:');
            util.log(opbeatErr.stack);
        } else {
            util.log('Logged to Opbeat: ' + url);
        }
        process.exit(1);
    };

    process.on('uncaughtException', function (err) {
        util.log('Opbeat caught unhandled exception:');
        util.log(err.stack);

        // Since we exit the node-process we cannot guarantee that the
        // listeners will be called, so to ensure a uniform result,
        // we'll remove all event listeners if an uncaught exception is
        // found
        client.removeAllListeners();

        client.captureError(err, callback);
    });
};
