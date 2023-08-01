/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const ndjson = require('ndjson');
const os = require('os');
const path = require('path');
const semver = require('semver');
const test = require('tape');
const URL = require('url').URL;

const utils = require('./lib/utils');
const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');
const {
  detectHostname,
} = require('../../../lib/apm-client/http-apm-client/detect-hostname');
const getContainerInfo = require('../../../lib/apm-client/http-apm-client/container-info');

const APMServer = utils.APMServer;
const processIntakeReq = utils.processIntakeReq;
const validOpts = utils.validOpts;

const detectedHostname = detectHostname();

test('throw if missing required options', function (t) {
  t.throws(() => new HttpApmClient(), 'throws if no options are provided');
  t.throws(
    () => new HttpApmClient({ agentName: 'foo' }),
    'throws if only agentName is provided',
  );
  t.throws(
    () => new HttpApmClient({ agentVersion: 'foo' }),
    'throws if only agentVersion is provided',
  );
  t.throws(
    () => new HttpApmClient({ serviceName: 'foo' }),
    'throws if only serviceName is provided',
  );
  t.throws(
    () => new HttpApmClient({ userAgent: 'foo' }),
    'throws if only userAgent is provided',
  );
  t.throws(
    () =>
      new HttpApmClient({
        agentName: 'foo',
        agentVersion: 'foo',
        serviceName: 'foo',
      }),
    'throws if userAgent is missing',
  );
  t.throws(
    () =>
      new HttpApmClient({
        agentName: 'foo',
        agentVersion: 'foo',
        userAgent: 'foo',
      }),
    'throws if serviceName is missing',
  );
  t.throws(
    () =>
      new HttpApmClient({
        agentName: 'foo',
        serviceName: 'foo',
        userAgent: 'foo',
      }),
    'throws if agentVersion is missing',
  );
  t.throws(
    () =>
      new HttpApmClient({
        agentVersion: 'foo',
        serviceName: 'foo',
        userAgent: 'foo',
      }),
    'throws if agentName is missing',
  );
  t.doesNotThrow(
    () =>
      new HttpApmClient({
        agentName: 'foo',
        agentVersion: 'foo',
        serviceName: 'foo',
        userAgent: 'foo',
      }),
    "doesn't throw if required options are provided",
  );
  t.end();
});

test('should work without new', function (t) {
  const client = HttpApmClient(validOpts());
  t.ok(client instanceof HttpApmClient);
  t.end();
});

test("null value config options shouldn't throw", function (t) {
  t.doesNotThrow(function () {
    new HttpApmClient(
      validOpts({
        // eslint-disable-line no-new
        size: null,
        time: null,
        serverTimeout: null,
        type: null,
        serverUrl: null,
        keepAlive: null,
        labels: null,
      }),
    );
  });
  t.end();
});

test('no secretToken or apiKey', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    t.notOk('authorization' in req.headers, 'no Authorization header');
    res.end();
    server.close();
    client.destroy();
    t.end();
  });
  server.listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        apmServerVersion: '8.0.0',
      }),
    );
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('has apiKey', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    t.equal(
      req.headers.authorization,
      'ApiKey FooBar123',
      'should use apiKey in authorization header',
    );
    res.end();
    server.close();
    client.destroy();
    t.end();
  });
  server.listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        apiKey: 'FooBar123',
        apmServerVersion: '8.0.0',
      }),
    );
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('custom headers', function (t) {
  t.plan(1);

  let client;
  const server = APMServer(function (req, res) {
    t.equal(req.headers['x-foo'], 'bar');
    res.end();
    server.close();
    client.destroy();
    t.end();
  }).listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port,
        headers: {
          'X-Foo': 'bar',
        },
        apmServerVersion: '8.0.0',
      }),
    );
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('serverUrl is invalid', function (t) {
  t.throws(function () {
    new HttpApmClient(
      validOpts({
        // eslint-disable-line no-new
        serverUrl: 'invalid',
        apmServerVersion: '8.0.0',
      }),
    );
  });
  t.end();
});

test('serverUrl contains path', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    t.equal(req.url, '/subpath/intake/v2/events');
    res.end();
    server.close();
    client.destroy();
    t.end();
  }).listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + server.address().port + '/subpath',
        apmServerVersion: '8.0.0',
      }),
    );
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('reject unauthorized TLS by default', function (t) {
  t.plan(3);
  const server = APMServer({ secure: true }, function (req, res) {
    t.fail('should should not get request');
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    client.on('request-error', function (err) {
      t.ok(err instanceof Error);
      let expectedErrorMessage = 'self signed certificate';
      if (semver.gte(process.version, 'v17.0.0')) {
        expectedErrorMessage = 'self-signed certificate';
      }
      t.equal(err.message, expectedErrorMessage);
      t.equal(err.code, 'DEPTH_ZERO_SELF_SIGNED_CERT');
      server.close();
      t.end();
    });
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('allow unauthorized TLS if asked', function (t) {
  t.plan(1);
  let client;
  const server = APMServer({ secure: true }, function (req, res) {
    t.pass('should let request through');
    res.end();
    client.destroy();
    server.close();
    t.end();
  }).client(
    { rejectUnauthorized: false, apmServerVersion: '8.0.0' },
    function (client_) {
      client = client_;
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

test('allow self-signed TLS certificate by specifying the CA', function (t) {
  t.plan(1);
  let client;
  const server = APMServer({ secure: true }, function (req, res) {
    t.pass('should let request through');
    res.end();
    client.destroy();
    server.close();
    t.end();
  });
  server.client(
    { serverCaCert: server.cert, apmServerVersion: '8.0.0' },
    function (client_) {
      client = client_;
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

test('metadata', function (t) {
  t.plan(11);
  let client;
  const opts = {
    agentName: 'custom-agentName',
    agentVersion: 'custom-agentVersion',
    agentActivationMethod: 'custom-agentActivationMethod',
    serviceName: 'custom-serviceName',
    serviceNodeName: 'custom-serviceNodeName',
    serviceVersion: 'custom-serviceVersion',
    frameworkName: 'custom-frameworkName',
    frameworkVersion: 'custom-frameworkVersion',
    configuredHostname: 'custom-hostname',
    environment: 'production',
    globalLabels: {
      foo: 'bar',
      doesNotNest: {
        nope: 'this should be [object Object]',
      },
    },
    apmServerVersion: '8.7.1', // avoid the APM server version fetch request
  };
  const server = APMServer(function (req, res) {
    req = processIntakeReq(req);
    req.once('data', function (obj) {
      const expects = {
        metadata: {
          service: {
            name: 'custom-serviceName',
            environment: 'production',
            runtime: {
              name: 'node',
              version: process.versions.node,
            },
            language: {
              name: 'javascript',
            },
            agent: {
              name: 'custom-agentName',
              version: 'custom-agentVersion',
              activation_method: 'custom-agentActivationMethod',
            },
            framework: {
              name: 'custom-frameworkName',
              version: 'custom-frameworkVersion',
            },
            version: 'custom-serviceVersion',
            node: {
              configured_name: 'custom-serviceNodeName',
            },
          },
          process: {
            pid: process.pid,
            title: process.title,
            argv: process.argv,
          },
          system: {
            architecture: process.arch,
            platform: process.platform,
            detected_hostname: detectedHostname,
            configured_hostname: 'custom-hostname',
          },
          labels: {
            foo: 'bar',
            doesNotNest: '[object Object]',
          },
        },
      };

      if (semver.gte(process.version, '8.10.0')) {
        expects.metadata.process.ppid = process.ppid;
      }

      t.deepEqual(obj, expects);

      t.ok(semver.valid(obj.metadata.service.runtime.version));
      t.ok(
        obj.metadata.process.pid > 0,
        `pid should be > 0, was ${obj.metadata.process.pid}`,
      );
      if (semver.gte(process.version, '8.10.0')) {
        t.ok(
          obj.metadata.process.ppid > 0,
          `ppid should be > 0, was ${obj.metadata.process.ppid}`,
        );
      } else {
        t.equal(obj.metadata.process.ppid, undefined);
      }
      t.ok(Array.isArray(obj.metadata.process.argv));
      t.ok(obj.metadata.process.argv.every((arg) => typeof arg === 'string'));
      t.ok(obj.metadata.process.argv.every((arg) => arg.length > 0));
      t.equal(typeof obj.metadata.system.architecture, 'string');
      t.ok(obj.metadata.system.architecture.length > 0);
      t.equal(typeof obj.metadata.system.platform, 'string');
      t.ok(obj.metadata.system.platform.length > 0);
    });
    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      t.end();
    });
  }).client(opts, function (client_) {
    client = client_;
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('metadata - default values', function (t) {
  t.plan(1);
  let client;
  const opts = {
    agentName: 'custom-agentName',
    agentVersion: 'custom-agentVersion',
    serviceName: 'custom-serviceName',
    apmServerVersion: '8.0.0', // avoid the APM server version fetch request
  };
  const server = APMServer(function (req, res) {
    req = processIntakeReq(req);
    req.once('data', function (obj) {
      const expects = {
        metadata: {
          service: {
            name: 'custom-serviceName',
            environment: 'development',
            runtime: {
              name: 'node',
              version: process.versions.node,
            },
            language: {
              name: 'javascript',
            },
            agent: {
              name: 'custom-agentName',
              version: 'custom-agentVersion',
            },
          },
          process: {
            pid: process.pid,
            title: process.title,
            argv: process.argv,
          },
          system: {
            architecture: process.arch,
            platform: process.platform,
            detected_hostname: detectedHostname,
          },
        },
      };

      if (semver.gte(process.version, '8.10.0')) {
        expects.metadata.process.ppid = process.ppid;
      }

      t.deepEqual(obj, expects);
    });

    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      t.end();
    });
  }).client(opts, function (client_) {
    client = client_;
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('metadata - container info', function (t) {
  // Clear Client and APMServer from require cache
  delete require.cache[
    require.resolve('../../../lib/apm-client/http-apm-client')
  ];
  delete require.cache[require.resolve('./lib/utils')];

  const sync = getContainerInfo.sync;
  getContainerInfo.sync = function sync() {
    return {
      containerId: 'container-id',
      podId: 'pod-id',
    };
  };
  t.on('end', () => {
    getContainerInfo.sync = sync;
  });

  const APMServer = require('./lib/utils').APMServer;

  let client;
  const server = APMServer(function (req, res) {
    req = processIntakeReq(req);
    req.once('data', function (obj) {
      t.ok(obj.metadata);
      t.ok(obj.metadata.system);
      t.deepEqual(obj.metadata.system.container, {
        id: 'container-id',
      });
      t.deepEqual(obj.metadata.system.kubernetes, {
        pod: {
          name: detectedHostname.split('.')[0],
          uid: 'pod-id',
        },
      });
    });
    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      t.end();
    });
  }).client({ apmServerVersion: '8.0.0' }, function (client_) {
    client = client_;
    client.sendSpan({ foo: 42 });
    client.end();
  });
});

test('agentName', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    req = processIntakeReq(req);
    req.once('data', function (obj) {
      t.equal(obj.metadata.service.name, 'custom');
    });
    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      t.end();
    });
  }).client(
    { serviceName: 'custom', apmServerVersion: '8.0.0' },
    function (client_) {
      client = client_;
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

test('payloadLogFile', function (t) {
  t.plan(6);

  const receivedObjects = [];
  const filename = path.join(os.tmpdir(), Date.now() + '.ndjson');
  let requests = 0;

  let client;
  const server = APMServer(function (req, res) {
    const request = ++requests;

    req = processIntakeReq(req);

    req.on('data', function (obj) {
      receivedObjects.push(obj);
    });

    req.on('end', function () {
      res.end();

      if (request === 2) {
        client.destroy();
        server.close();
        t.equal(receivedObjects.length, 5, 'should have received 5 objects');

        const file = fs.createReadStream(filename).pipe(ndjson.parse());

        file.on('data', function (obj) {
          const expected = receivedObjects.shift();
          const n = 5 - receivedObjects.length;
          t.deepEqual(
            obj,
            expected,
            `expected line ${n} in the log file to match item no ${n} received by the server`,
          );
        });

        file.on('end', function () {
          t.end();
        });
      }
    });
  }).client(
    { payloadLogFile: filename, apmServerVersion: '8.0.0' },
    function (client_) {
      client = client_;
      client.sendTransaction({ req: 1 });
      client.sendSpan({ req: 2 });
      client.flush(); // force the client to make a 2nd request so that we test reusing the file across requests
      client.sendError({ req: 3 });
      client.end();
    },
  );
});

test('update conf', function (t) {
  t.plan(1);
  let client;
  const server = APMServer(function (req, res) {
    req = processIntakeReq(req);
    req.once('data', function (obj) {
      t.equal(obj.metadata.service.name, 'bar');
    });
    req.on('end', function () {
      res.end();
      client.destroy();
      server.close();
      t.end();
    });
  }).client(
    { serviceName: 'foo', apmServerVersion: '8.0.0' },
    function (client_) {
      client = client_;
      client.config({ serviceName: 'bar' });
      client.sendSpan({ foo: 42 });
      client.end();
    },
  );
});

// There was a case (https://github.com/elastic/apm-agent-nodejs/issues/1749)
// where a non-200 response from apm-server would crash the agent.
test('503 response from apm-server for central config should not crash', function (t) {
  let client;

  // If this test goes wrong, it can hang. Clean up after a 30s timeout.
  const abortTimeout = setTimeout(function () {
    t.fail('test hung, aborting after a timeout');
    cleanUpAndEnd();
  }, 30000);

  function cleanUpAndEnd() {
    if (abortTimeout) {
      clearTimeout(abortTimeout);
    }
    client.destroy();
    mockApmServer.close(function () {
      t.end();
    });
  }

  // 1. Start a mock apm-server that returns 503 for central config queries.
  const mockApmServer = http.createServer(function (req, res) {
    const parsedUrl = new URL(req.url, 'http://localhost:0');
    let resBody = '{}';
    if (parsedUrl.pathname === '/config/v1/agents') {
      resBody =
        '{"ok":false,"message":"The requested resource is currently unavailable."}\n';
      res.writeHead(503);
    }
    res.end(resBody);
  });

  mockApmServer.listen(function () {
    client = new HttpApmClient(
      validOpts({
        serverUrl: 'http://localhost:' + mockApmServer.address().port,
        // Turn centralConfig *off*. We'll manually trigger a poll for central
        // config via internal methods, so that we don't need to muck with
        // internal `setTimeout` intervals.
        centralConfig: false,
        apmServerVersion: '8.0.0',
      }),
    );

    // 2. Ensure the client conditions for the crash.
    //    One of the crash conditions at the time was a second `client.config`
    //    to ensure the request options were using the keep-alive agent.
    client.config();
    t.ok(
      client._conf.requestConfig.agent,
      'agent for central config requests is defined',
    );

    client.on('config', function (config) {
      t.fail('do not expect to get a successful central config response');
    });
    client.on('request-error', function (err) {
      t.ok(err, 'got request-error on _pollConfig');
      t.ok(
        err.message.indexOf(
          'Unexpected APM Server response when polling config',
        ) !== -1,
        'request-error from _pollConfig includes expected error message',
      );
      cleanUpAndEnd();
    });

    // 3. Make a poll for central config.
    client._pollConfig();
  });
});
