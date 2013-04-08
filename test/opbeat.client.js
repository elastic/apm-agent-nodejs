var opbeat = require('../')
  , fs = require('fs')
  , nock = require('nock')
  , common = require('common')
  , mockudp = require('mock-udp');

var options = {
    organization_id: 'some-org-id',
    app_id: 'some-app-id',
    secret_token: 'secret',
    handleExceptions: false
};

var disableUncaughtExceptionHandler = {
    handleExceptions: false
};

var _oldConsoleWarn = console.warn;
var mockConsoleWarn = function () {
    console.warn = function () {
        console.warn._called = true;
    };
    console.warn._called = false;
}
var restoreConsoleWarn = function () {
    console.warn = _oldConsoleWarn;
}

describe('opbeat.version', function () {
    it('should be valid', function () {
        opbeat.version.should.match(/^\d+\.\d+\.\d+(-\w+)?$/);
    });

    it('should match package.json', function () {
        var version = require('../package.json').version;
        opbeat.version.should.equal(version);
    });
});

describe('opbeat.createClient', function () {
    var client;
    var skipBody = function (path) { return '*'; };
    beforeEach(function () {
        process.env.NODE_ENV='production';
    });

    it('should parse the DSN with options', function () {
        var expected = {
            protocol: 'https',
            host: 'opbeat.com',
            path: '/api/v1/organizations/some-org-id/apps/some-app-id/errors/'
        };
        client = opbeat.createClient(common.join(options, { hostname: 'my-hostname' }));
        client.dsn.should.eql(expected);
        client.hostname.should.equal('my-hostname');
    });

    it('should pull OPBEAT_ORGANIZATION_ID from environment', function () {
        mockConsoleWarn();
        process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
        client = opbeat.createClient(disableUncaughtExceptionHandler);
        client.organization_id.should.eql('another-org-id');
        delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
        restoreConsoleWarn();
    });

    it('should pull OPBEAT_ORGANIZATION_ID from environment when passing options', function () {
        var expected = {
            protocol: 'https',
            host: 'opbeat.com',
            path: '/api/v1/organizations/another-org-id/apps/some-app-id/errors/'
        };
        process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
        client = opbeat.createClient({
            app_id: 'some-app-id',
            secret_token: 'secret',
            handleExceptions: false
        });
        client.dsn.should.eql(expected);
        client.organization_id.should.equal('another-org-id');
        client.app_id.should.equal('some-app-id');
        client.secret_token.should.equal('secret');
        delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
    });

    it('should be disabled when no options have been specified', function () {
        mockConsoleWarn();
        client = opbeat.createClient(disableUncaughtExceptionHandler);
        client._enabled.should.eql(false);
        console.warn._called.should.eql(true);
        restoreConsoleWarn();
    });

    it('should pull OPBEAT_APP_ID from environment', function () {
        mockConsoleWarn();
        process.env.OPBEAT_APP_ID='another-app-id';
        client = opbeat.createClient(disableUncaughtExceptionHandler);
        client.app_id.should.eql('another-app-id');
        delete process.env.OPBEAT_APP_ID;
        restoreConsoleWarn();
    });

    it('should pull OPBEAT_SECRET_TOKEN from environment', function () {
        mockConsoleWarn();
        process.env.OPBEAT_SECRET_TOKEN='pazz';
        client = opbeat.createClient(disableUncaughtExceptionHandler);
        client.secret_token.should.eql('pazz');
        delete process.env.OPBEAT_SECRET_TOKEN;
        restoreConsoleWarn();
    });

    it('should be disabled and warn when NODE_ENV=test', function () {
        mockConsoleWarn();
        process.env.NODE_ENV = 'test';
        client = opbeat.createClient(options);
        client._enabled.should.eql(false);
        console.warn._called.should.eql(true);
        restoreConsoleWarn();
    });

    describe('#captureMessage()', function () {
        beforeEach(function () {
            client = opbeat.createClient(options);
        });

        it('should send a plain text message to Opbeat server', function (done) {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .defaultReplyHeaders({'Location': 'foo'})
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200);

            client.on('logged', function (result) {
                result.should.eql('foo');
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });

        it('should emit error when request returns non 200', function (done) {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, { error_message: 'Oops!' });

            client.on('error', function () {
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });

        it('shouldn\'t shit it\'s pants when error is emitted without a listener', function () {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, { error_message: 'Oops!' });

            client.captureMessage('Hey!');
        });

        it('should attach an Error object when emitting error', function (done) {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, { error_message: 'Oops!' });

            client.on('error', function (err) {
                err.message.should.eql('Opbeat error (500): Oops!');
                scope.done();
                done();
            });

            client.captureMessage('Hey!');
        });
    });

    describe('#captureError()', function () {
        beforeEach(function () {
            client = opbeat.createClient(options);
        });

        it('should send an Error to Opbeat server', function (done) {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .defaultReplyHeaders({'Location': 'foo'})
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200);

            client.on('logged', function (result) {
                result.should.eql('foo');
                scope.done();
                done();
            });
            client.captureError(new Error('wtf?'));
        });

        it('should send a plain text "error" as a Message instead', function (done) {
            // See: https://github.com/mattrobenolt/raven-node/issues/18
            var old = client.captureMessage;
            client.captureMessage = function (message) {
                // I'm also appending "Error: " to the beginning to help hint
                message.should.equal('Error: wtf?');
                done();
                client.captureMessage = old;
            };
            client.captureError('wtf?');
        });
    });

    describe('#handleUncaughtExceptions()', function () {
        it('should add itself to the uncaughtException event list', function () {
            var before = process._events.uncaughtException.length;
            client.handleUncaughtExceptions();
            process._events.uncaughtException.length.should.equal(before+1);
            process._events.uncaughtException.pop(); // patch it back to what it was
        });

        it('should send an uncaughtException to Opbeat server', function (done) {
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200);

            // remove existing uncaughtException handlers
            var before = process._events.uncaughtException;
            process.removeAllListeners('uncaughtException');

            client.handleUncaughtExceptions(function (opbeatErr, url) {
                // restore things to how they were
                process._events.uncaughtException = before;
                scope.done();
                done();
            });

            mockConsoleWarn();
            process.emit('uncaughtException', new Error('derp'));
            restoreConsoleWarn();
        });
    });
});
