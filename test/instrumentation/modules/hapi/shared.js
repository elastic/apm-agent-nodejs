/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

module.exports = (moduleName) => {
  var agent = require('../../../..').start({
    serviceName: 'test-hapi',
    captureExceptions: false,
    logLevel: 'off',
    metricsInterval: 0,
    centralConfig: false,
    cloudProvider: 'none',
    captureBody: 'all',
  });

  var isHapiIncompat = require('../../../_is_hapi_incompat');
  if (isHapiIncompat(moduleName)) {
    // Skip out of this test.
    console.log(
      `# SKIP this version of ${moduleName} is incompatible with node ${process.version}`,
    );
    process.exit();
  }

  var http = require('http');

  var Hapi = require(moduleName);
  var pkg = require(moduleName + '/package.json');
  var semver = require('semver');
  var test = require('tape');

  var mockClient = require('../../../_mock_http_client');

  var originalCaptureError = agent.captureError;

  function noop() {}

  test('extract URL from request', function (t) {
    resetAgent(2, function (data) {
      t.strictEqual(data.transactions.length, 1);
      t.strictEqual(data.errors.length, 1);
      var request = data.errors[0].context.request;
      t.strictEqual(request.method, 'GET');
      t.strictEqual(request.url.pathname, '/captureError');
      t.strictEqual(request.url.search, '?foo=bar');
      t.strictEqual(request.url.raw, '/captureError?foo=bar');
      t.strictEqual(request.url.hostname, 'localhost');
      t.strictEqual(request.url.port, String(server.info.port));
      server.stop(noop);
      t.end();
    });

    agent.captureError = originalCaptureError;

    var server = startServer(function (err, port) {
      t.error(err, 'no error from startServer');
      http.get('http://localhost:' + port + '/captureError?foo=bar');
    });
  });

  test('route naming', function (t) {
    t.plan(8);

    resetAgent(1, function (data) {
      assert(t, data);
      server.stop(noop);
    });

    var server = startServer(function (err, port) {
      t.error(err);
      http.get('http://localhost:' + port + '/hello', function (res) {
        t.strictEqual(res.statusCode, 200);
        res.on('data', function (chunk) {
          t.strictEqual(chunk.toString(), 'hello world');
        });
        res.on('end', function () {
          agent.flush();
        });
      });
    });
  });

  test('captureBody', function (t) {
    t.plan(9);

    const postData = JSON.stringify({ foo: 'bar' });

    resetAgent(1, function (data) {
      assert(t, data, { name: 'POST /postSomeData', method: 'POST' });
      t.equal(
        data.transactions[0].context.request.body,
        postData,
        'body was captured to trans.context.request.body',
      );
      server.stop(noop);
    });

    var server = startServer(function (err, port) {
      t.error(err);
      const cReq = http.request(
        {
          method: 'POST',
          hostname: 'localhost',
          port,
          path: '/postSomeData',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        function (res) {
          t.strictEqual(res.statusCode, 200);
          res.on('data', function (chunk) {
            t.strictEqual(chunk.toString(), 'your data has been posted');
          });
          res.on('end', function () {
            agent.flush();
          });
        },
      );
      cReq.write(postData);
      cReq.end();
    });
  });

  test('connectionless', function (t) {
    if (semver.satisfies(pkg.version, '<15.0.2')) {
      t.pass('skipping');
      t.end();
      return;
    }

    t.plan(1);

    resetAgent();

    var server = makeServer();
    initServer(server, function (err) {
      server.stop(noop);
      t.error(err, 'start error');
    });
  });

  test('connectionless server error logging with Error', function (t) {
    if (semver.satisfies(pkg.version, '<15.0.2')) {
      t.pass('skipping');
      t.end();
      return;
    }

    t.plan(6);

    var customError = new Error('custom error');

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(opts.custom.data instanceof Error);
    };

    var server = makeServer();
    initServer(server, function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('connectionless server error logging with String', function (t) {
    if (semver.satisfies(pkg.version, '<15.0.2')) {
      t.pass('skipping');
      t.end();
      return;
    }

    t.plan(6);

    var customError = 'custom error';

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(typeof opts.custom.data === 'string');
    };

    var server = makeServer();
    initServer(server, function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('connectionless server error logging with Object', function (t) {
    if (semver.satisfies(pkg.version, '<15.0.2')) {
      t.pass('skipping');
      t.end();
      return;
    }

    t.plan(6);

    var customError = {
      error: 'I forgot to turn this into an actual Error',
    };

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, 'hapi server emitted a log event tagged error');
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.deepEqual(opts.custom.data, customError);
    };

    var server = makeServer();
    initServer(server, function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('server error logging with Error', function (t) {
    t.plan(6);

    var customError = new Error('custom error');

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(opts.custom.data instanceof Error);
    };

    var server = startServer(function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('server error logging with Error does not affect event tags', function (t) {
    t.plan(8);

    var customError = new Error('custom error');

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(opts.custom.data instanceof Error);
    };

    var server = makeServer();

    var emitter = server.events || server;
    emitter.on('log', function (event, tags) {
      t.deepEqual(event.tags, ['error']);
    });

    runServer(server, function (err) {
      t.error(err, 'start error');

      emitter.on('log', function (event, tags) {
        t.deepEqual(event.tags, ['error']);
      });

      server.log(['error'], customError);
    });
  });

  test('server error logging with String', function (t) {
    t.plan(6);

    var customError = 'custom error';

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(typeof opts.custom.data === 'string');
    };

    var server = startServer(function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('server error logging with Object', function (t) {
    t.plan(6);

    var customError = {
      error: 'I forgot to turn this into an actual Error',
    };

    resetAgent();

    agent.captureError = function (err, opts) {
      server.stop(noop);

      t.strictEqual(err, 'hapi server emitted a log event tagged error');
      t.ok(opts.custom);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.deepEqual(opts.custom.data, customError);
    };

    var server = startServer(function (err) {
      t.error(err, 'start error');

      server.log(['error'], customError);
    });
  });

  test('request error logging with Error', function (t) {
    t.plan(13);

    var customError = new Error('custom error');

    resetAgent(1, function (data) {
      assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' });

      server.stop(noop);
    });

    agent.captureError = function (err, opts) {
      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.ok(opts.request);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(opts.custom.data instanceof Error);
    };

    var server = makeServer();

    server.route({
      method: 'GET',
      path: '/error',
      handler: handler(function (request) {
        request.log(['error'], customError);

        return 'hello world';
      }),
    });

    runServer(server, function (err) {
      t.error(err, 'start error');

      http.get(
        'http://localhost:' + server.info.port + '/error',
        function (res) {
          t.strictEqual(res.statusCode, 200);

          res.resume().on('end', function () {
            agent.flush();
          });
        },
      );
    });
  });

  test('request error logging with Error does not affect event tags', function (t) {
    t.plan(15);

    var customError = new Error('custom error');

    resetAgent(1, function (data) {
      assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' });

      server.stop(noop);
    });

    agent.captureError = function (err, opts) {
      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.ok(opts.request);
      t.deepEqual(opts.custom.tags, ['elastic-apm', 'error']);
      t.false(opts.custom.internals);
      t.ok(opts.custom.data instanceof Error);
    };

    var server = makeServer();

    server.route({
      method: 'GET',
      path: '/error',
      handler: handler(function (request) {
        request.log(['elastic-apm', 'error'], customError);

        return 'hello world';
      }),
    });

    var emitter = server.events || server;
    emitter.on('request', function (req, event, tags) {
      if (event.channel === 'internal') return;
      t.deepEqual(event.tags, ['elastic-apm', 'error']);
    });

    runServer(server, function (err) {
      t.error(err, 'start error');

      emitter.on('request', function (req, event, tags) {
        if (event.channel === 'internal') return;
        t.deepEqual(event.tags, ['elastic-apm', 'error']);
      });

      http.get(
        'http://localhost:' + server.info.port + '/error',
        function (res) {
          t.strictEqual(res.statusCode, 200);

          res.resume().on('end', function () {
            agent.flush();
          });
        },
      );
    });
  });

  test('request error logging with String', function (t) {
    t.plan(13);

    var customError = 'custom error';

    resetAgent(1, function (data) {
      assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' });

      server.stop(noop);
    });

    agent.captureError = function (err, opts) {
      t.strictEqual(err, customError);
      t.ok(opts.custom);
      t.ok(opts.request);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.ok(typeof opts.custom.data === 'string');
    };

    var server = makeServer();

    server.route({
      method: 'GET',
      path: '/error',
      handler: handler(function (request) {
        request.log(['error'], customError);

        return 'hello world';
      }),
    });

    runServer(server, function (err) {
      t.error(err, 'start error');

      http.get(
        'http://localhost:' + server.info.port + '/error',
        function (res) {
          t.strictEqual(res.statusCode, 200);

          res.resume().on('end', function () {
            agent.flush();
          });
        },
      );
    });
  });

  test('request error logging with Object', function (t) {
    t.plan(13);

    var customError = {
      error: 'I forgot to turn this into an actual Error',
    };

    resetAgent(1, function (data) {
      assert(t, data, { status: 'HTTP 2xx', name: 'GET /error' });

      server.stop(noop);
    });

    agent.captureError = function (err, opts) {
      t.strictEqual(err, 'hapi server emitted a request event tagged error');
      t.ok(opts.custom);
      t.ok(opts.request);
      t.deepEqual(opts.custom.tags, ['error']);
      t.false(opts.custom.internals);
      t.deepEqual(opts.custom.data, customError);
    };

    var server = makeServer();

    server.route({
      method: 'GET',
      path: '/error',
      handler: handler(function (request) {
        request.log(['error'], customError);

        return 'hello world';
      }),
    });

    runServer(server, function (err) {
      t.error(err, 'start error');

      http.get(
        'http://localhost:' + server.info.port + '/error',
        function (res) {
          t.strictEqual(res.statusCode, 200);

          res.resume().on('end', function () {
            agent.flush();
          });
        },
      );
    });
  });

  test('error handling', function (t) {
    t.plan(10);

    resetAgent(1, function (data) {
      assert(t, data, { status: 'HTTP 5xx', name: 'GET /error' });
      server.stop(noop);
    });

    agent.captureError = function (err, opts) {
      t.strictEqual(err.message, 'foo');
      t.ok(opts.request instanceof http.IncomingMessage);
    };

    var server = startServer(function (err, port) {
      t.error(err);
      http.get('http://localhost:' + port + '/error', function (res) {
        t.strictEqual(res.statusCode, 500);
        res.on('data', function (chunk) {
          var data = JSON.parse(chunk.toString());
          t.deepEqual(data, {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'An internal server error occurred',
          });
        });
        res.on('end', function () {
          agent.flush();
        });
      });
    });
  });

  function makeServer(opts) {
    // Specify 'localhost' to avoid Hapi default of '0.0.0.0' which ties to
    // IPv4. We want a later HTTP client request using 'localhost' to work.
    var server;
    if (semver.satisfies(pkg.version, '<17')) {
      server = new Hapi.Server();
      opts = opts || {};
      opts.host = opts.host || 'localhost';
      server.connection(opts);
    } else {
      server = new Hapi.Server({ host: 'localhost' });
    }
    return server;
  }

  function initServer(server, cb) {
    if (semver.satisfies(pkg.version, '<17')) {
      server.initialize(cb);
    } else {
      server.initialize().then(cb.bind(null, null), cb);
    }
  }

  function runServer(server, cb) {
    if (semver.satisfies(pkg.version, '<17')) {
      server.start(function (err) {
        if (err) throw err;
        cb(null, server.info.port);
      });
    } else {
      server.start().then(() => cb(null, server.info.port), cb);
    }
  }

  function startServer(cb) {
    var server = buildServer();
    runServer(server, cb);
    return server;
  }

  function handler(fn) {
    if (semver.satisfies(pkg.version, '>=17')) return fn;
    return function (request, reply) {
      var p = new Promise(function (resolve, reject) {
        resolve(fn(request));
      });
      p.then(reply, reply);
    };
  }

  function buildServer() {
    var server = makeServer();

    server.route({
      method: 'GET',
      path: '/hello',
      handler: handler(function (request) {
        return 'hello world';
      }),
    });
    server.route({
      method: 'POST',
      path: '/postSomeData',
      handler: handler(function (request) {
        return 'your data has been posted';
      }),
    });
    server.route({
      method: 'GET',
      path: '/error',
      handler: handler(function (request) {
        throw new Error('foo');
      }),
    });
    server.route({
      method: 'GET',
      path: '/captureError',
      handler: handler(function (request) {
        agent.captureError(new Error());
        return '';
      }),
    });
    return server;
  }

  function assert(t, data, results) {
    if (!results) results = {};
    results.status = results.status || 'HTTP 2xx';
    results.name = results.name || 'GET /hello';
    results.method = results.method || 'GET';

    t.strictEqual(data.transactions.length, 1);

    var trans = data.transactions[0];

    t.strictEqual(trans.name, results.name);
    t.strictEqual(trans.type, 'request');
    t.strictEqual(trans.result, results.status);
    t.strictEqual(trans.context.request.method, results.method);
  }

  function resetAgent(expected, cb) {
    agent._instrumentation.testReset();
    agent._apmClient = mockClient(expected, cb);
    agent.captureError = function (err) {
      throw err;
    };
  }
};
