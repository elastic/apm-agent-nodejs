'use strict';

var fs = require('fs');
var os = require('os');
var zlib = require('zlib');
var assert = require('assert');
var nock = require('nock');
var common = require('common');
var afterAll = require('after-all');
var logger = require('../lib/logger');
var request = require('../lib/request');
var opbeat = require('../');

var options = {
  organizationId: 'some-org-id',
  appId: 'some-app-id',
  secretToken: 'secret',
  captureExceptions: false
};

var disableUncaughtExceptionHandler = {
  captureExceptions: false
};

var optionFixtures = [
  ['appId', 'APP_ID'],
  ['organizationId', 'ORGANIZATION_ID'],
  ['secretToken', 'SECRET_TOKEN'],
  ['clientLogLevel', 'CLIENT_LOG_LEVEL', 'info'],
  ['hostname', 'HOSTNAME', os.hostname()],
  ['stackTraceLimit', 'STACK_TRACE_LIMIT', Infinity],
  ['captureExceptions', 'CAPTURE_EXCEPTIONS', true],
  ['exceptionLogLevel', 'EXCEPTION_LOG_LEVEL', 'fatal']
];

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
  var uncaughtExceptionListeners;
  beforeEach(function () {
    uncaughtExceptionListeners = process._events.uncaughtException;
    process.removeAllListeners('uncaughtException');
    if (opbeat._client) {
      opbeat._client.removeAllListeners();
      delete opbeat._client;
    }
    mockLogger();
  });
  afterEach(function () {
    process._events.uncaughtException = uncaughtExceptionListeners;
    restoreLogger();
  });

  optionFixtures.forEach(function (fixture) {
    it('should be configurable by envrionment variable OPBEAT_' + fixture[1], function () {
      var bool = typeof fixture[2] === 'boolean';
      var value = bool ? (fixture[2] ? '0' : '1') : 'custom-value';
      process.env['OPBEAT_' + fixture[1]] = value;
      client = opbeat();
      var v2 = bool ? value != false : value;
      assert.strictEqual(client[fixture[0]], bool ? value != false : value);
      delete process.env['OPBEAT_' + fixture[1]];
    });

    it('should overwrite OPBEAT_' + fixture[1] + ' by option property ' + fixture[0], function () {
      var options = {};
      var bool = typeof fixture[2] === 'boolean';
      var value1 = bool ? (fixture[2] ? '0' : '1') : 'overwriting-value';
      var value2 = bool ? (fixture[2] ? '1' : '0') : 'custom-value';
      options[fixture[0]] = value1;
      process.env['OPBEAT_' + fixture[1]] = value2;
      client = opbeat(options);
      assert.strictEqual(client[fixture[0]], bool ? value1 != false : value1);
      delete process.env['OPBEAT_' + fixture[1]];
    });

    it('should default ' + fixture[0] + ' to ' + fixture[2], function () {
      client = opbeat();
      assert.strictEqual(client[fixture[0]], fixture[2]);
    });
  });

  it('should be configurable by envrionment variable OPBEAT_ACTIVE', function () {
    process.env.OPBEAT_ACTIVE = '0';
    client = opbeat({ appId: 'foo', organizationId: 'bar', secretToken: 'baz' });
    assert.strictEqual(client.active, false);
    delete process.env.OPBEAT_ACTIVE;
  });

  it('should overwrite OPBEAT_ACTIVE by option property active', function () {
    var options = { appId: 'foo', organizationId: 'bar', secretToken: 'baz', active: false };
    process.env.OPBEAT_ACTIVE = '1';
    client = opbeat(options);
    assert.strictEqual(client.active, false);
    delete process.env.OPBEAT_ACTIVE;
  });

  it('should default active to true if required options have been specified', function () {
    client = opbeat({ appId: 'foo', organizationId: 'bar', secretToken: 'baz' });
    assert.strictEqual(client.active, true);
  });

  it('should default active to false if required options have not been specified', function () {
    client = opbeat();
    assert.strictEqual(client.active, false);
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

    it('shouldn\'t shit it\'s pants when error is emitted without a listener', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(500, { error: 'Oops!' });

      client.captureError('Hey!');
      setTimeout(done, 25);
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
      var oldErrorFn = request.error;
      request.error = function (client, options, callback) {
        assert('message' in options);
        assert('param_message' in options);
        assert.strictEqual(options.message, 'Hello World');
        assert.strictEqual(options.param_message, 'Hello %s');
        request.error = oldErrorFn;
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
    it('should add itself to the uncaughtException event list', function () {
      assert.strictEqual(process._events.uncaughtException, undefined);
      client = opbeat(options);
      client.handleUncaughtExceptions();
      assert.strictEqual(process._events.uncaughtException.length, 1);
    });

    it('should not add more than one listener for the uncaughtException event', function () {
      client = opbeat(options);
      client.handleUncaughtExceptions();
      var before = process._events.uncaughtException.length;
      client.handleUncaughtExceptions();
      assert.strictEqual(process._events.uncaughtException.length, before);
    });

    it('should send an uncaughtException to Opbeat server', function (done) {
      var scope = nock('https://opbeat.com')
        .filteringRequestBody(skipBody)
        .defaultReplyHeaders({'Location': 'foo'})
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
        .reply(200);

      client = opbeat(options);
      client.handleUncaughtExceptions(function (err, url) {
        assert.strictEqual(url, 'foo');
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
      var expected = JSON.stringify({ status: 'completed', rev: 'foo' });
      zlib.deflate(expected, function (err, buffer) {
        assert.ifError(err);

        var scope = nock('https://opbeat.com')
          .filteringRequestBody(function (body) {
            assert.strictEqual(body, buffer.toString('hex'));
            return 'ok';
          })
          .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', 'ok')
          .reply(200);

        client.trackDeployment({ rev: 'foo' }, function () {
          scope.done();
          done();
        });
      });
    });

    it('should send deployment request to the Opbeat server with given rev and branch', function (done) {
      var expected = JSON.stringify({ status: 'completed', rev: 'foo', branch: 'bar' });
      zlib.deflate(expected, function (err, buffer) {
        assert.ifError(err);

        var scope = nock('https://opbeat.com')
          .filteringRequestBody(function (body) {
            assert.strictEqual(body, buffer.toString('hex'));
            return 'ok';
          })
          .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', 'ok')
          .reply(200);

        client.trackDeployment({ rev: 'foo', branch: 'bar' }, function () {
          scope.done();
          done();
        });
      });
    });

    it('should send deployment request to the Opbeat server with given rev and branch automatically generated', function (done) {
      var expected = JSON.stringify({ status: 'completed', rev: 'foo', branch: 'bar' });
      zlib.deflate(expected, function (err, buffer) {
        assert.ifError(err);

        var next = afterAll(function (err) {
          assert.ifError(err);
          scope.done();
          done();
        });
        var cb = next();

        var scope = nock('https://opbeat.com')
          .filteringRequestBody(function (body) {
            zlib.inflate(new Buffer(body, 'hex'), function (err, buffer) {
              assert.ifError(err);
              var json = JSON.parse(buffer.toString());
              assert.strictEqual(Object.keys(json).length, 3);
              assert.strictEqual(json.status, 'completed');
              assert.ok(/^[\da-f]{40}$/.test(json.rev));
              assert.ok(/^[^ ]+$/.test(json.branch));
              cb();
            });
            return '*';
          })
          .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', '*')
          .reply(200);

        client.trackDeployment(next());
      });
    });
  });
});
