var parsers = require('./parsers');
var zlib = require('zlib');
var uuid = require('node-uuid');
var transports = require('./transports');
var node_util = require('util'); // node_util to avoid confusion with "utils"
var events = require('events');
var os = require('os');

module.exports.version = require('../package.json').version;

var Client = function Client(options) {
    options = options || {};

    this.org_id       = options.org_id       || process.env.OPBEAT_ORG_ID;
    this.app_id       = options.app_id       || process.env.OPBEAT_APP_ID;
    this.secret_token = options.secret_token || process.env.OPBEAT_SECRET_TOKEN;
    this.env          = options.env          || process.env.NODE_ENV || 'development';
    this.loggerName   = options.logger || '';
    this.hostname     = options.hostname || os.hostname();
    this.dsn          = {
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

    this.on('error', function(e) {});  // noop
};
node_util.inherits(Client, events.EventEmitter);
var _ = Client.prototype;

module.exports.Client = Client;

_.getIdent =
_.get_ident = function getIdent(result) {
    return result.id;
};

_.process = function process(kwargs) {
    var event_id = uuid().replace(/-/g, '');

    kwargs['machine'] = { hostname: this.hostname };
    kwargs['extra'] = kwargs['extra'] || {};
    kwargs['extra']['node'] = process.version;
    kwargs['logger'] = this.loggerName;
    kwargs['client_supplied_id'] = event_id;
    kwargs['timestamp'] = new Date().toISOString().split('.')[0];

    // this will happen asynchronously. We don't care about it's response.
    this._enabled && this.send(kwargs);

    return {'id': event_id };
};

_.send = function send(kwargs) {
    var self = this;
    zlib.deflate(JSON.stringify(kwargs), function(err, buff) {
        var headers = {
                'Authorization': 'Bearer ' + self.secret_token,
                'Content-Type': 'application/octet-stream',
                'Content-Length': buff.length,
                'User-Agent': 'opbeat-nodejs/' + module.exports.version
            };

        transports[self.dsn.protocol].send(self, buff, headers);
    });
};

_.captureMessage = function captureMessage(message, kwargs, cb) {
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    var result = this.process(parsers.parseText(message, kwargs));
    cb && cb(result);
    return result;
};

_.captureError =
_.captureException = function captureError(err, kwargs, cb) {
    if(!(err instanceof Error)) {
        // This handles when someone does:
        //   throw "something awesome";
        // We just send the "Error" as a normal message
        // since there is no way to compute a stack trace
        // See: https://github.com/mattrobenolt/raven-node/issues/18
        return this.captureMessage('Error: ' + err, kwargs, cb);
    }

    var self = this;
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    parsers.parseError(err, kwargs, function(kw) {
        var result = self.process(kw);
        cb && cb(result);
    });
};

_.patchGlobal = function patchGlobal(cb) {
    module.exports.patchGlobal(this, cb);
};

module.exports.patchGlobal = function patchGlobal(client, cb) {
    // handle when the first argument is the callback, with no client specified
    if(typeof client === 'function') {
        cb = client;
        client = new Client();
    // first argument is a string DSN
    } else if(typeof client === 'string') {
        client = new Client(client);
    }
    // at the end, if we still don't have a Client, let's make one!
    !(client instanceof Client) && (client = new Client());

    process.on('uncaughtException', function(err) {
        if(cb) {  // bind event listeners only if a callback was supplied
            client.once('logged', function() {
                cb(true, err);
            });
            client.once('error', function() {
                cb(false, err);
            });
        }
        client.captureError(err, function(result) {
            node_util.log('uncaughtException: '+client.getIdent(result));
        });
    });
};
