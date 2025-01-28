/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const http = require('http');
const https = require('https');
const os = require('os');
const { URL } = require('url');
const zlib = require('zlib');
const semver = require('semver');
const ndjson = require('ndjson');
const { HttpApmClient } = require('../../../../lib/apm-client/http-apm-client');

exports.APMServer = APMServer;
exports.processIntakeReq = processIntakeReq;
exports.assertIntakeReq = assertIntakeReq;
exports.assertConfigReq = assertConfigReq;
exports.assertMetadata = assertMetadata;
exports.assertEvent = assertEvent;
exports.validOpts = validOpts;

function APMServer(opts, onreq) {
  if (typeof opts === 'function') return APMServer(null, opts);
  opts = opts || {};

  const secure = !!opts.secure;

  const server = secure
    ? https.createServer({ cert: tlsCert, key: tlsKey }, onreq)
    : http.createServer(onreq);

  // Because we use a keep-alive agent in the client, we need to unref the
  // sockets received by the server. If not, the server would hold open the app
  // even after the tests have completed
  server.on('connection', function (socket) {
    socket.unref();
  });

  server.client = function (clientOpts, onclient) {
    if (typeof clientOpts === 'function') {
      onclient = clientOpts;
      clientOpts = {};
    }
    server.listen(function () {
      onclient(
        new HttpApmClient(
          validOpts(
            Object.assign(
              {
                // logger: require('pino')({ level: 'trace' }), // uncomment for debugging
                serverUrl: `http${secure ? 's' : ''}://localhost:${
                  server.address().port
                }`,
                secretToken: 'secret',
              },
              clientOpts,
            ),
          ),
        ),
      );
    });
    return server;
  };

  return server;
}

function processIntakeReq(req) {
  return req.pipe(zlib.createGunzip()).pipe(ndjson.parse());
}

function assertIntakeReq(t, req) {
  t.equal(req.method, 'POST', 'should make a POST request');
  t.equal(
    req.url,
    '/intake/v2/events',
    'should send request to /intake/v2/events',
  );
  t.equal(
    req.headers.authorization,
    'Bearer secret',
    'should add secret token',
  );
  t.equal(
    req.headers['content-type'],
    'application/x-ndjson',
    'should send reqeust as ndjson',
  );
  t.equal(req.headers['content-encoding'], 'gzip', 'should compress request');
  t.equal(
    req.headers.accept,
    'application/json',
    'should expect json in response',
  );
  t.equal(
    req.headers['user-agent'],
    'my-user-agent',
    'should add proper User-Agent',
  );
}
assertIntakeReq.asserts = 7;

function assertConfigReq(t, req) {
  const url = new URL(req.url, 'relative:///');

  t.equal(req.method, 'GET', 'should make a GET request');
  t.equal(
    url.pathname,
    '/config/v1/agents',
    'should send request to /config/v1/agents',
  );
  t.equal(
    url.search,
    '?service.name=my-service-name&service.environment=development',
    'should encode query in query params',
  );
  t.equal(
    req.headers.authorization,
    'Bearer secret',
    'should add secret token',
  );
  t.equal(
    req.headers['user-agent'],
    'my-user-agent',
    'should add proper User-Agent',
  );
}
assertConfigReq.asserts = 5;

function assertMetadata(t, obj) {
  t.deepEqual(Object.keys(obj), ['metadata']);
  const metadata = obj.metadata;
  const metadataKeys = new Set(Object.keys(metadata));
  t.ok(metadataKeys.has('service'));
  t.ok(metadataKeys.has('process'));
  t.ok(metadataKeys.has('system'));
  const service = metadata.service;
  t.equal(service.name, 'my-service-name');
  t.equal(service.runtime.name, 'node');
  t.equal(service.runtime.version, process.versions.node);
  t.ok(semver.valid(service.runtime.version));
  t.equal(service.language.name, 'javascript');
  t.equal(service.agent.name, 'my-agent-name');
  t.equal(service.agent.version, 'my-agent-version');
  const _process = metadata.process;
  t.ok(_process.pid > 0, `pid should be > 0, was ${_process.pid}`);
  if (semver.gte(process.version, '8.10.0')) {
    t.ok(_process.ppid > 0, `ppid should be > 0, was ${_process.ppid}`);
  } else {
    t.equal(_process.ppid, undefined);
  }

  if (os.platform() === 'win32') {
    t.ok('skip process.title check on Windows');
  } else if (_process.title.length === 1) {
    // because of truncation test
    t.equal(_process.title, process.title[0]);
  } else {
    const regex = /node/;
    t.ok(
      regex.test(_process.title),
      `process.title should match ${regex} (was: ${_process.title})`,
    );
  }

  t.ok(Array.isArray(_process.argv), 'process.title should be an array');
  t.ok(
    _process.argv.length >= 2,
    'process.title should contain at least two elements',
  );
  var regex = /node(\.exe)?$/i;
  t.ok(
    regex.test(_process.argv[0]),
    `process.argv[0] should match ${regex} (was: ${_process.argv[0]})`,
  );
  regex = /(test.*\.js|tape)$/;
  t.ok(
    regex.test(_process.argv[1]),
    `process.argv[1] should match ${regex} (was: ${_process.argv[1]})"`,
  );
  const system = metadata.system;
  if ('detected_hostname' in system) {
    t.ok(typeof system.detected_hostname, 'string');
    t.ok(system.detected_hostname.length > 0);
  } else {
    t.ok(typeof system.hostname, 'string');
    t.ok(system.hostname.length > 0);
  }
  t.ok(typeof system.architecture, 'string');
  t.ok(system.architecture.length > 0);
  t.ok(typeof system.platform, 'string');
  t.ok(system.platform.length > 0);
}
assertMetadata.asserts = 24;

function assertEvent(expect) {
  return function (t, obj) {
    const key = Object.keys(expect)[0];
    const val = expect[key];
    switch (key) {
      case 'transaction':
        if (!('name' in val)) val.name = 'undefined';
        if (!('type' in val)) val.type = 'undefined';
        if (!('result' in val)) val.result = 'undefined';
        break;
      case 'span':
        if (!('name' in val)) val.name = 'undefined';
        if (!('type' in val)) val.type = 'undefined';
        break;
      case 'error':
        break;
      case 'metricset':
        break;
      default:
        t.fail('unexpected event type: ' + key);
    }
    t.deepEqual(obj, expect);
  };
}
assertEvent.asserts = 1;

function validOpts(opts) {
  return Object.assign(
    {
      agentName: 'my-agent-name',
      agentVersion: 'my-agent-version',
      serviceName: 'my-service-name',
      userAgent: 'my-user-agent',
      environment: 'development',
    },
    opts,
  );
}

// tlsCert and tlsKey were generated via the same method as Go's builtin
// test certificate/key pair, using
// https://github.com/golang/go/blob/master/src/crypto/tls/generate_cert.go:
//
//     go run generate_cert.go --rsa-bits 1024 --host 127.0.0.1,::1,localhost \
//                             --ca --start-date "Jan 1 00:00:00 1970" \
//                             --duration=1000000h
//
// The certificate is valid for 127.0.0.1, ::1, and localhost; and expires in the year 2084.

const tlsCert = `-----BEGIN CERTIFICATE-----
MIIDODCCAiCgAwIBAgIRAKcvPDc2YJPyfyN8tudKJMgwDQYJKoZIhvcNAQELBQAw
EjEQMA4GA1UEChMHQWNtZSBDbzAgFw03MDAxMDEwMDAwMDBaGA8yMDg0MDEyOTE2
MDAwMFowEjEQMA4GA1UEChMHQWNtZSBDbzCCASIwDQYJKoZIhvcNAQEBBQADggEP
ADCCAQoCggEBAKPpGG4wOBAuLLarmMAtljTEdleZFZ5sng6PU0svSO0Eo9brK3J7
M7wK9YHYO9L0WKOxp8NszyDbQCBKr11PxeOiSnzSjz74JevfzbYVlqyp3crHtZL6
D6lkefoMZ9wRYwBf2zbV7XQwrXtU7fTurkcrE9x5kFz3NTF0m2ekBD8hW94MVvuA
okVraGfiGxC3cS/UwrsRZKroplu32mZqs+Ne7q3P/RKHXVcjeu7NvpTbHSQZZ4Lr
mhyJ+2rfhnpnpcvXYzMIKiSCWJX4SIsMGOG1ftyrCknjSRuZzTOsTjWgj50AD2s7
HopZWqZKroJ+dsGwR3iDI+uQ+7elvtrNqvkCAwEAAaOBhjCBgzAOBgNVHQ8BAf8E
BAMCAqQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH/BAUwAwEB/zAdBgNV
HQ4EFgQUIZATCNVqewTl99rj6+vqACfkD4kwLAYDVR0RBCUwI4IJbG9jYWxob3N0
hwR/AAABhxAAAAAAAAAAAAAAAAAAAAABMA0GCSqGSIb3DQEBCwUAA4IBAQBv/MYW
bzxNRKtCXgmd7L3ufU1H5U/gisLQh2wzFh6n7D0w63/NSMQzI12h8MzuV6ceTP7m
cndGtY+x3nwP5CtpXPqf0T/9660zD60quRMLVzlPd6X6iR1FvASL74739mlGOStX
9JkkTShHWTzi9uN2ff84kgpH+lJ3pjy/S6mCKt0op2ciWFFXPij3mT28wQLYDhKl
ZWLLSwL+aO4faf041zQMPj6Er615UUQ/Rfp1hLUx708ZCdRpxWcIf3dq07Ej7Zje
eVbY/+WG436R0DEsyx1Gdp+j0qWD9mT3teV4Ix9WGViZ0Mi3ugdGQ/qwDeabI/wZ
jtWJ/jvDSDkM6Pjp
-----END CERTIFICATE-----`;

const tlsKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCj6RhuMDgQLiy2
q5jALZY0xHZXmRWebJ4Oj1NLL0jtBKPW6ytyezO8CvWB2DvS9FijsafDbM8g20Ag
Sq9dT8Xjokp80o8++CXr3822FZasqd3Kx7WS+g+pZHn6DGfcEWMAX9s21e10MK17
VO307q5HKxPceZBc9zUxdJtnpAQ/IVveDFb7gKJFa2hn4hsQt3Ev1MK7EWSq6KZb
t9pmarPjXu6tz/0Sh11XI3ruzb6U2x0kGWeC65ociftq34Z6Z6XL12MzCCokgliV
+EiLDBjhtX7cqwpJ40kbmc0zrE41oI+dAA9rOx6KWVqmSq6CfnbBsEd4gyPrkPu3
pb7azar5AgMBAAECggEAbLhZ+gyFw0W9ZtTfFuml7g46KNRjoJePJz0uFHqitoQT
YKTQRrktkZb7TUruM3jbqohWLKvpn3OOT1z6gLw/GEQ3gB/x3+Sc0p26RwJ+1Lw/
Xxeken7fEI6S0aaU5UWrEz6Bmxe+zwjSqTGmPIZslswd+mmvtdpLMCiWQ+Jo5q3b
hiH9DjeXKH01pocsiR94sbZhPiyqVKT1ROVRL/ZqzrTN7bfOLyV/+Q8ap9HZeve0
IIIjRM0aXf2B1ihsEEcI2x5WcUgBC/j87C48G82k8UkM1TBkTqvKMG4xLHF2+ozT
Go8H8P2bTq0cdzOVWdP/V6tCUlgWpZk2cxFwxHl54QKBgQDaL9VZTQ2kTOzQsHM/
dx3M04L0M0q0c4U4Had3H7AG5G6oAJCVerLJ6//s4ebcSZAl25vcTfhLwOQ7MP5O
yUt3sG0l8WxHg2dmBvJNPNMXbcb6s0mh5uMVKSOJb4LGTh66Yi/dZaPUM1TEPYU/
N/YwLtnpDdqyUVFlPMID8ZhPpQKBgQDAUTd6h5C/YXK+L5DzFYTaweCBmnsCm/SG
+kPYr53inZT6rjQKC3KJ+xkS7VJLOLwyCyXVIiBo7FsK4+uv5Xs/U3LmHIE9r9/9
/QyBTmyjF4gOgeYFm7Baad4UlzZ0e19QHaBBSUuB6HD82sK+/HVOSlCymRjfe8pq
6SJwPMkNxQKBgQCGtcfE1gUZLwF7q6XMRnAYuXJ98XkrRrO2vOBbdS4KY1lK0uZx
1Aq1Dse5apRN6AFezmNBtsYZh2OihBJPdIrqv/vz1EYlNSVO4fUR6P7v1TBoMu/A
TTxhIUA2p6mXZD4ml160E//9kR/B9bXiHVwbzaFu+cXQGNLnbYbgRnbinQKBgCap
bSTF0hSXS5DuUQ59OfscVLzZSHdq0Mq9zxvlmjDviv6mPLH0QS95+j1y1kNnAXZy
BUYGmUtekKLs1PnEgXVmmkemXVkAXWBbGcN496AF4AVCmfJwrRBQDiRHjdv23V9m
xUu6p2JTTzuV4uawLAj0Kart2jE7WqMJgTHdFnIdAoGBAMRIPlX+DmEAcYT+myW5
ObMJmwpdEhT/m0cngmbL72JcBoEVgx4Sz2HOph3cE9xFWKhNW3P0y3VK4ChIU7H0
P70Ozwd20sayRGSdCnoBHHs8tCq4dKngAtKbtfUlckMeZ2yYNZ7q4sKaM3kxeUL8
I3ecah+z8imp0AGSmqddCPD+
-----END PRIVATE KEY-----`;
