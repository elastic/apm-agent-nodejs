'use strict';

var fs = require('fs');
var querystring = require('querystring');
var assert = require('assert');
var nock = require('nock');
var common = require('common');
var opbeat = require('../');

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
    assert(/^\d+\.\d+\.\d+(-\w+)?$/.test(opbeat.version));
  });

  it('should match package.json', function () {
    var version = require('../package.json').version;
    assert.strictEqual(opbeat.version, version);
  });
});

describe('opbeat.createClient', function () {
  var client;
  var skipBody = function (path) { return '*'; };
  beforeEach(function () {
    mockConsoleWarn();
    process.env.NODE_ENV='production';
  });
  afterEach(function () {
    restoreConsoleWarn();
  });

  it('should initialize the client property', function () {
    assert(!('client' in opbeat));
    client = opbeat.createClient(options);
    assert('client' in opbeat);
    assert('dsn' in opbeat.client);
  });

  it('should parse the DSN with options', function () {
    var expected = {
      host: 'opbeat.com',
      path: '/api/v1/organizations/some-org-id/apps/some-app-id/'
    };
    client = opbeat.createClient(common.join(options, { hostname: 'my-hostname' }));
    assert.deepEqual(client.dsn, expected);
    assert.strictEqual(client.hostname, 'my-hostname');
  });

  it('should pull OPBEAT_ORGANIZATION_ID from environment', function () {
    process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
    client = opbeat.createClient(disableUncaughtExceptionHandler);
    assert.strictEqual(client.organization_id, 'another-org-id');
    delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
  });

  it('should pull OPBEAT_ORGANIZATION_ID from environment when passing options', function () {
    var expected = {
      host: 'opbeat.com',
      path: '/api/v1/organizations/another-org-id/apps/some-app-id/'
    };
    process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
    client = opbeat.createClient({
      app_id: 'some-app-id',
      secret_token: 'secret',
      handleExceptions: false
    });
    assert.deepEqual(client.dsn, expected);
    assert.strictEqual(client.organization_id, 'another-org-id');
    assert.strictEqual(client.app_id, 'some-app-id');
    assert.strictEqual(client.secret_token, 'secret');
    delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
  });

  it('should be disabled when no options have been specified', function () {
    client = opbeat.createClient(disableUncaughtExceptionHandler);
    assert.strictEqual(client._enabled, false);
    assert.strictEqual(console.warn._called, true);
  });

  it('should pull OPBEAT_APP_ID from environment', function () {
    process.env.OPBEAT_APP_ID='another-app-id';
    client = opbeat.createClient(disableUncaughtExceptionHandler);
    assert.strictEqual(client.app_id, 'another-app-id');
    delete process.env.OPBEAT_APP_ID;
  });

  it('should pull OPBEAT_SECRET_TOKEN from environment', function () {
    process.env.OPBEAT_SECRET_TOKEN='pazz';
    client = opbeat.createClient(disableUncaughtExceptionHandler);
    assert.strictEqual(client.secret_token, 'pazz');
    delete process.env.OPBEAT_SECRET_TOKEN;
  });

  it('should be disabled and warn when NODE_ENV=test', function () {
    process.env.NODE_ENV = 'test';
    client = opbeat.createClient(options);
    assert.strictEqual(client._enabled, false);
    assert.strictEqual(console.warn._called, true);
  });

  describe('#captureError()', function () {
    beforeEach(function () {
      mockConsoleWarn();
      client = opbeat.createClient(options);
    });
    afterEach(function () {
      restoreConsoleWarn();
    });

    it('should send a plain text message to Opbeat server', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(200);

      client.on('logged', function (result) {
        assert.strictEqual(result, 'foo');
        scope.done();
        done();
      });
      client.captureError('Hey!');
    });

    it('should emit error when request returns non 200', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(500, { error: 'Oops!' });

      client.on('error', function () {
        scope.done();
        done();
      });
      client.captureError('Hey!');
    });

    it('shouldn\'t shit it\'s pants when error is emitted without a listener', function () {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(500, { error: 'Oops!' });

      client.captureError('Hey!');
    });

    it('should attach an Error object when emitting error', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(500, { error: 'Oops!' });

      client.on('error', function (err) {
        assert.strictEqual(err.message, 'Opbeat error (500): {"error":"Oops!"}');
        scope.done();
        done();
      });

      client.captureError('Hey!');
    });

    it('should use `param_message` as well as `message` if given an object as 1st argument', function (done) {
      var oldProcess = client.process;
      client.process = function (options, cb) {
        assert('message' in options);
        assert('param_message' in options);
        assert.strictEqual(options.message, 'Hello World');
        assert.strictEqual(options.param_message, 'Hello %s');
        client.process = oldProcess;
        done();
      };
      client.captureError({ message: 'Hello %s', params: ['World'] });
    });

    it('should send an Error to Opbeat server', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(200);

      client.on('logged', function (result) {
        assert.strictEqual(result, 'foo');
        scope.done();
        done();
      });
      client.captureError(new Error('wtf?'));
    });
  });

  describe('#handleUncaughtExceptions()', function () {
    beforeEach(function () {
      mockConsoleWarn();
      client = opbeat.createClient(options);
    });
    afterEach(function () {
      restoreConsoleWarn();
    });

    it('should add itself to the uncaughtException event list', function () {
      var before = process._events.uncaughtException.length;
      client.handleUncaughtExceptions();
      assert.strictEqual(process._events.uncaughtException.length, before+1);
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

      client.handleUncaughtExceptions(function (err) {
        // restore things to how they were
        process._events.uncaughtException = before;
        scope.done();
        done();
      });

      process.emit('uncaughtException', new Error('derp'));
    });
  });

  describe('#trackDeployment()', function () {
    beforeEach(function () {
      client = opbeat.createClient(options);
    });

    it('should send deployment request to the Opbeat server with given rev', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          var params = querystring.parse(body);
          if (Object.keys(params).length === 3 &&
              params.rev === 'foo' &&
              params.status === 'completed' &&
              params.hostname.length > 0) return 'ok';
          throw new Error('Unexpected body: ' + body);
        })
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/deployments/', 'ok')
        .reply(200);

      client.trackDeployment({ rev: 'foo' }, function () {
        scope.done();
        done();
      });
    });

    it('should send deployment request to the Opbeat server with given rev and branch', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          var params = querystring.parse(body);
          if (Object.keys(params).length === 4 &&
              params.rev === 'foo' &&
              params.branch === 'bar' &&
              params.status === 'completed' &&
              params.hostname.length > 0) return 'ok';
          throw new Error('Unexpected body: ' + body);
        })
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/deployments/', 'ok')
        .reply(200);

      client.trackDeployment({ rev: 'foo', branch: 'bar' }, function () {
        scope.done();
        done();
      });
    });

    it('should send deployment request to the Opbeat server with given rev and branch automatically generated', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          var params = querystring.parse(body);
          if (Object.keys(params).length === 4 &&
              /^[\da-f]{40}$/.test(params.rev) &&
              ~['master', 'HEAD'].indexOf(params.branch) &&
              params.status === 'completed' &&
              params.hostname.length > 0) return 'ok';
          throw new Error('Unexpected body: ' + body);
        })
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/deployments/', 'ok')
        .reply(200);

      client.trackDeployment(function () {
        scope.done();
        done();
      });
    });
  });
});
