'use strict';

var fs = require('fs');
var os = require('os');
var zlib = require('zlib');
var util = require('util');
var test = require('tape');
var nock = require('nock');
var common = require('common');
var afterAll = require('after-all');
var helpers = require('./_helpers');
var request = require('../lib/request');
var opbeat = require('../');

var options = {
  organizationId: 'some-org-id',
  appId: 'some-app-id',
  secretToken: 'secret',
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

var falsyValues = [false, 0, '', '0', 'false', 'no', 'off', 'disabled'];
var truthyValues = [true, 1, '1', 'true', 'yes', 'on', 'enabled'];

var skipBody = function () { return '*'; };
var uncaughtExceptionListeners = process._events.uncaughtException;

var setup = function () {
  clean();
  uncaughtExceptionListeners = process._events.uncaughtException;
  process.removeAllListeners('uncaughtException');
  helpers.mockLogger();
};

var clean = function () {
  process._events.uncaughtException = uncaughtExceptionListeners;
  helpers.restoreLogger();
};

optionFixtures.forEach(function (fixture) {
  test('should be configurable by envrionment variable OPBEAT_' + fixture[1], function (t) {
    setup();
    var bool = typeof fixture[2] === 'boolean';
    var value = bool ? (fixture[2] ? '0' : '1') : 'custom-value';
    process.env['OPBEAT_' + fixture[1]] = value;
    var client = opbeat();
    t.equal(client[fixture[0]], bool ? value != false : value);
    delete process.env['OPBEAT_' + fixture[1]];
    t.end();
  });

  test('should overwrite OPBEAT_' + fixture[1] + ' by option property ' + fixture[0], function (t) {
    setup();
    var options = {};
    var bool = typeof fixture[2] === 'boolean';
    var value1 = bool ? (fixture[2] ? '0' : '1') : 'overwriting-value';
    var value2 = bool ? (fixture[2] ? '1' : '0') : 'custom-value';
    options[fixture[0]] = value1;
    process.env['OPBEAT_' + fixture[1]] = value2;
    var client = opbeat(options);
    t.equal(client[fixture[0]], bool ? value1 != false : value1);
    delete process.env['OPBEAT_' + fixture[1]];
    t.end();
  });

  test('should default ' + fixture[0] + ' to ' + fixture[2], function (t) {
    setup();
    var client = opbeat();
    t.equal(client[fixture[0]], fixture[2]);
    t.end();
  });
});

falsyValues.forEach(function (val) {
  test('should be disabled by envrionment variable OPBEAT_ACTIVE set to: ' + util.inspect(val), function (t) {
    setup();
    process.env.OPBEAT_ACTIVE = val;
    var client = opbeat({ appId: 'foo', organizationId: 'bar', secretToken: 'baz' });
    t.equal(client.active, false);
    delete process.env.OPBEAT_ACTIVE;
    t.end();
  });
});

truthyValues.forEach(function (val) {
  test('should be enabled by envrionment variable OPBEAT_ACTIVE set to: ' + util.inspect(val), function (t) {
    setup();
    process.env.OPBEAT_ACTIVE = val;
    var client = opbeat({ appId: 'foo', organizationId: 'bar', secretToken: 'baz' });
    t.equal(client.active, true);
    delete process.env.OPBEAT_ACTIVE;
    t.end();
  });
});

test('should overwrite OPBEAT_ACTIVE by option property active', function (t) {
  setup();
  var options = { appId: 'foo', organizationId: 'bar', secretToken: 'baz', active: false };
  process.env.OPBEAT_ACTIVE = '1';
  var client = opbeat(options);
  t.equal(client.active, false);
  delete process.env.OPBEAT_ACTIVE;
  t.end();
});

test('should default active to true if required options have been specified', function (t) {
  setup();
  var client = opbeat({ appId: 'foo', organizationId: 'bar', secretToken: 'baz' });
  t.equal(client.active, true);
  t.end();
});

test('should default active to false if required options have not been specified', function (t) {
  setup();
  var client = opbeat();
  t.equal(client.active, false);
  t.end();
});

test('should force active to false if required options have not been specified', function (t) {
  setup();
  var client = opbeat({ active: true });
  t.equal(client.active, false);
  t.end();
});

test('#captureError()', function (t) {
  t.test('should send a plain text message to Opbeat server', function (t) {
    setup();
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .defaultReplyHeaders({'Location': 'foo'})
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(200);

    client.on('logged', function (result) {
      scope.done();
      t.equal(result, 'foo');
      t.end();
    });
    client.captureError('Hey!');
  });

  t.test('should emit error when request returns non 200', function (t) {
    setup();
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500, { error: 'Oops!' });

    client.on('error', function () {
      scope.done();
      t.end();
    });
    client.captureError('Hey!');
  });

  t.test('shouldn\'t shit it\'s pants when error is emitted without a listener', function (t) {
    setup();
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500, { error: 'Oops!' });

    client.captureError('Hey!');
    setTimeout(function () {
      t.end();
    }, 25);
  });

  t.test('should attach an Error object when emitting error', function (t) {
    setup();
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(500, { error: 'Oops!' });

    client.on('error', function (err) {
      scope.done();
      t.equal(err.message, 'Opbeat error (500): {"error":"Oops!"}');
      t.end();
    });

    client.captureError('Hey!');
  });

  t.test('should use `param_message` as well as `message` if given an object as 1st argument', function (t) {
    setup();
    var client = opbeat(options);
    var oldErrorFn = request.error;
    request.error = function (client, options, callback) {
      t.ok('message' in options);
      t.ok('param_message' in options);
      t.equal(options.message, 'Hello World');
      t.equal(options.param_message, 'Hello %s');
      request.error = oldErrorFn;
      t.end();
    };
    client.captureError({ message: 'Hello %s', params: ['World'] });
  });

  t.test('should send an Error to Opbeat server', function (t) {
    setup();
    var client = opbeat(options);
    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .defaultReplyHeaders({'Location': 'foo'})
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(200);

    client.on('logged', function (result) {
      scope.done();
      t.equal(result, 'foo');
      t.end();
    });
    client.captureError(new Error('wtf?'));
  });
});

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    setup();
    t.equal(process._events.uncaughtException, undefined);
    var client = opbeat(options);
    client.handleUncaughtExceptions();
    t.equal(process._events.uncaughtException.length, 1);
    t.end();
  });

  t.test('should not add more than one listener for the uncaughtException event', function (t) {
    setup();
    var client = opbeat(options);
    client.handleUncaughtExceptions();
    var before = process._events.uncaughtException.length;
    client.handleUncaughtExceptions();
    t.equal(process._events.uncaughtException.length, before);
    t.end();
  });

  t.test('should send an uncaughtException to Opbeat server', function (t) {
    setup();

    var scope = nock('https://opbeat.com')
      .filteringRequestBody(skipBody)
      .defaultReplyHeaders({'Location': 'foo'})
      .post('/api/v1/organizations/some-org-id/apps/some-app-id/errors/', '*')
      .reply(200);

    var client = opbeat(options);
    client.handleUncaughtExceptions(function (err, url) {
      scope.done();
      t.equal(url, 'foo');
      t.end();
    });

    process.emit('uncaughtException', new Error('derp'));
  });
});

test('#trackDeployment()', function (t) {
  t.test('should send deployment request to the Opbeat server with given rev', function (t) {
    setup();
    var client = opbeat(options);
    var expected = JSON.stringify({ status: 'completed', rev: 'foo' });
    zlib.deflate(expected, function (err, buffer) {
      t.error(err);

      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'));
          return 'ok';
        })
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', 'ok')
        .reply(200);

      client.trackDeployment({ rev: 'foo' }, function () {
        scope.done();
        t.end();
      });
    });
  });

  t.test('should send deployment request to the Opbeat server with given rev and branch', function (t) {
    setup();
    var client = opbeat(options);
    var expected = JSON.stringify({ status: 'completed', rev: 'foo', branch: 'bar' });
    zlib.deflate(expected, function (err, buffer) {
      t.error(err);

      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          t.equal(body, buffer.toString('hex'));
          return 'ok';
        })
        .post('/api/v1/organizations/some-org-id/apps/some-app-id/releases/', 'ok')
        .reply(200);

      client.trackDeployment({ rev: 'foo', branch: 'bar' }, function () {
        scope.done();
        t.end();
      });
    });
  });

  t.test('should send deployment request to the Opbeat server with given rev and branch automatically generated', function (t) {
    setup();
    var client = opbeat(options);
    var expected = JSON.stringify({ status: 'completed', rev: 'foo', branch: 'bar' });
    zlib.deflate(expected, function (err, buffer) {
      t.error(err);

      var next = afterAll(function (err) {
        scope.done();
        t.error(err);
        t.end();
      });
      var cb = next();

      var scope = nock('https://opbeat.com')
        .filteringRequestBody(function (body) {
          zlib.inflate(new Buffer(body, 'hex'), function (err, buffer) {
            t.error(err);
            var json = JSON.parse(buffer.toString());
            t.equal(Object.keys(json).length, 3);
            t.equal(json.status, 'completed');
            t.ok(/^[\da-f]{40}$/.test(json.rev));
            t.ok(/^[^ ]+$/.test(json.branch));
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
