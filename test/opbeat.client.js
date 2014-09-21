'use strict';

var fs = require('fs');
var querystring = require('querystring');
var assert = require('assert');
var nock = require('nock');
var common = require('common');
var logger = require('../lib/logger');
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

var _oldConsoleInfo = logger.info;
var _oldConsoleWarn = logger.warn;
var _oldConsoleError = logger.error;
var mockLogger = function () {
  logger.info = function () { logger.info._called = true; };
  logger.warn = function () { logger.warn._called = true; };
  logger.error = function () { logger.error._called = true; };
  logger.info._called = false;
  logger.warn._called = false;
  logger.error._called = false;
};
var restoreLogger = function () {
  logger.info = _oldConsoleInfo;
  logger.warn = _oldConsoleWarn;
  logger.error = _oldConsoleError;
};

describe('opbeat client', function () {
  var client;
  var skipBody = function (path) { return '*'; };
  beforeEach(function () {
    delete opbeat._client;
    mockLogger();
  });
  afterEach(function () {
    restoreLogger();
  });

  it('should initialize the client property', function () {
    client = opbeat(options);
    assert('api' in client);
  });

  it('should parse the API with options', function () {
    var expected = {
      host: 'opbeat.com',
      path: '/api/v1/organizations/some-org-id/apps/some-app-id/'
    };
    client = opbeat(common.join(options, { hostname: 'my-hostname' }));
    assert.deepEqual(client.api, expected);
    assert.strictEqual(client.hostname, 'my-hostname');
  });

  it('should pull OPBEAT_ORGANIZATION_ID from environment', function () {
    process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
    client = opbeat(disableUncaughtExceptionHandler);
    assert.strictEqual(client.organization_id, 'another-org-id');
    delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
  });

  it('should pull OPBEAT_ORGANIZATION_ID from environment when passing options', function () {
    var expected = {
      host: 'opbeat.com',
      path: '/api/v1/organizations/another-org-id/apps/some-app-id/'
    };
    process.env.OPBEAT_ORGANIZATION_ID='another-org-id';
    client = opbeat({
      app_id: 'some-app-id',
      secret_token: 'secret',
      handleExceptions: false
    });
    assert.deepEqual(client.api, expected);
    assert.strictEqual(client.organization_id, 'another-org-id');
    assert.strictEqual(client.app_id, 'some-app-id');
    assert.strictEqual(client.secret_token, 'secret');
    delete process.env.OPBEAT_ORGANIZATION_ID; // gotta clean up so it doesn't leak into other tests
  });

  it('should be disabled when no options have been specified', function () {
    client = opbeat(disableUncaughtExceptionHandler);
    assert.strictEqual(client.active, false);
    assert.strictEqual(logger.info._called, true);
  });

  it('should pull OPBEAT_APP_ID from environment', function () {
    process.env.OPBEAT_APP_ID='another-app-id';
    client = opbeat(disableUncaughtExceptionHandler);
    assert.strictEqual(client.app_id, 'another-app-id');
    delete process.env.OPBEAT_APP_ID;
  });

  it('should pull OPBEAT_SECRET_TOKEN from environment', function () {
    process.env.OPBEAT_SECRET_TOKEN='pazz';
    client = opbeat(disableUncaughtExceptionHandler);
    assert.strictEqual(client.secret_token, 'pazz');
    delete process.env.OPBEAT_SECRET_TOKEN;
  });

  it('should be disabled and log it when active=false', function () {
    client = opbeat(common.join(options, { active: false }));
    assert.strictEqual(client.active, false);
    assert.strictEqual(logger.info._called, true);
  });

  describe('#captureError()', function () {
    beforeEach(function () {
      mockLogger();
      client = opbeat(options);
    });
    afterEach(function () {
      restoreLogger();
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
      var oldProcess = client._process;
      client._process = function (options, cb) {
        assert('message' in options);
        assert('param_message' in options);
        assert.strictEqual(options.message, 'Hello World');
        assert.strictEqual(options.param_message, 'Hello %s');
        client._process = oldProcess;
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
      mockLogger();
      client = opbeat(options);
    });
    afterEach(function () {
      restoreLogger();
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
      client = opbeat(options);
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
              /^[^ ]+$/.test(params.branch) &&
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
