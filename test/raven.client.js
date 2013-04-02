var opbeat = require('../')
  , fs = require('fs')
  , nock = require('nock')
  , common = require('common')
  , mockudp = require('mock-udp');

var options = {
    org_id: 'some-org-id',
    app_id: 'some-app-id',
    secret_token: 'secret'
};

var _oldConsoleWarn = console.warn;
function mockConsoleWarn() {
    console.warn = function() {
        console.warn._called = true;
    };
    console.warn._called = false;
}
function restoreConsoleWarn() {
    console.warn = _oldConsoleWarn;
}

describe('opbeat.version', function(){
    it('should be valid', function(){
        opbeat.version.should.match(/^\d+\.\d+\.\d+(-\w+)?$/);
    });

    it('should match package.json', function(){
        var version = require('../package.json').version;
        opbeat.version.should.equal(version);
    });
});

describe('opbeat.Client', function(){
    var client;
    var skipBody = function(path) { return '*'; };
    beforeEach(function(){
        process.env.NODE_ENV='production';
        client = new opbeat.Client(options);
    });

    it('should parse the DSN with options', function(){
        var expected = {
            protocol: 'https',
            host: 'opbeat.com',
            path: '/api/v1/organizations/some-org-id/apps/some-app-id/errors/'
        };
        var client = new opbeat.Client(common.join(options, { hostname: 'my-hostname' }));
        client.dsn.should.eql(expected);
        client.hostname.should.equal('my-hostname');
    });

    it('should pull OPBEAT_ORG_ID from environment', function(){
        process.env.OPBEAT_ORG_ID='another-org-id';
        var client = new opbeat.Client();
        client.org_id.should.eql('another-org-id');
        delete process.env.OPBEAT_ORG_ID; // gotta clean up so it doesn't leak into other tests
    });

    it('should pull OPBEAT_ORG_ID from environment when passing options', function(){
        var expected = {
            protocol: 'https',
            host: 'opbeat.com',
            path: '/api/v1/organizations/another-org-id/apps/some-app-id/errors/'
        };
        process.env.OPBEAT_ORG_ID='another-org-id';
        var client = new opbeat.Client({
            app_id: 'some-app-id',
            secret_token: 'secret'
        });
        client.dsn.should.eql(expected);
        client.org_id.should.equal('another-org-id');
        client.app_id.should.equal('some-app-id');
        client.secret_token.should.equal('secret');
        delete process.env.OPBEAT_ORG_ID; // gotta clean up so it doesn't leak into other tests
    });

    it('should be disabled when no options have been specified', function(){
        mockConsoleWarn();
        var client = new opbeat.Client();
        client._enabled.should.eql(false);
        console.warn._called.should.eql(true);
        restoreConsoleWarn();
    });

    it('should pull OPBEAT_APP_ID from environment', function(){
        process.env.OPBEAT_APP_ID='another-app-id';
        var client = new opbeat.Client();
        client.app_id.should.eql('another-app-id');
        delete process.env.OPBEAT_APP_ID;
    });

    it('should pull OPBEAT_SECRET_TOKEN from environment', function(){
        process.env.OPBEAT_SECRET_TOKEN='pazz';
        var client = new opbeat.Client();
        client.secret_token.should.eql('pazz');
        delete process.env.OPBEAT_SECRET_TOKEN;
    });

    it('should be disabled and warn when NODE_ENV=test', function(){
        mockConsoleWarn();
        process.env.NODE_ENV = 'test';
        var client = new opbeat.Client(options);
        client._enabled.should.eql(false);
        console.warn._called.should.eql(true);
        restoreConsoleWarn();
    });

    describe('#getIdent()', function(){
        it('should match', function(){
            var result = { id: 'c988bf5cb7db4653825c92f6864e7206' };
            client.getIdent(result).should.equal('c988bf5cb7db4653825c92f6864e7206');
        });
    });

    describe('#captureMessage()', function(){
        it('should send a plain text message to Opbeat server', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200, 'OK');

            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });

        it('should emit error when request returns non 200', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, 'Oops!');

            client.on('error', function(){
                scope.done();
                done();
            });
            client.captureMessage('Hey!');
        });

        it('shouldn\'t shit it\'s pants when error is emitted without a listener', function(){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, 'Oops!');

            client.captureMessage('Hey!');
        });

        it('should attach an Error object when emitting error', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(500, 'Oops!');

            client.on('error', function(e){
                e.statusCode.should.eql(500);
                e.responseBody.should.eql('Oops!');
                e.response.should.be.ok;
                scope.done();
                done();
            });

            client.captureMessage('Hey!');
        });
    });

    describe('#captureError()', function(){
        it('should send an Error to Opbeat server', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200, 'OK');

            client.on('logged', function(){
                scope.done();
                done();
            });
            client.captureError(new Error('wtf?'));
        });

        it('should send a plain text "error" as a Message instead', function(done){
            // See: https://github.com/mattrobenolt/raven-node/issues/18
            var old = client.captureMessage;
            client.captureMessage = function(message) {
                // I'm also appending "Error: " to the beginning to help hint
                message.should.equal('Error: wtf?');
                done();
                client.captureMessage = old;
            };
            client.captureError('wtf?');
        });
    });

    describe('#patchGlobal()', function(){
        it('should add itself to the uncaughtException event list', function(){
            var before = process._events.uncaughtException;
            client.patchGlobal();
            process._events.uncaughtException.length.should.equal(before.length+1);
            process._events.uncaughtException = before; // patch it back to what it was
        });

        it('should send an uncaughtException to Opbeat server', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200, 'OK');

            // remove existing uncaughtException handlers
            var before = process._events.uncaughtException;
            process.removeAllListeners('uncaughtException');

            client.on('logged', function(){
                // restore things to how they were
                process._events.uncaughtException = before;

                scope.done();
                done();
            });
            client.patchGlobal();
            process.emit('uncaughtException', new Error('derp'));
        });

        it('should trigger a callback after an uncaughtException', function(done){
            var scope = nock('https://opbeat.com')
                .filteringRequestBody(skipBody)
                .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
                .reply(200, 'OK');

            // remove existing uncaughtException handlers
            var before = process._events.uncaughtException;
            process.removeAllListeners('uncaughtException');

            client.patchGlobal(function(){
                // restore things to how they were
                process._events.uncaughtException = before;

                scope.done();
                done();
            });
            process.emit('uncaughtException', new Error('derp'));
        });
    });
});
