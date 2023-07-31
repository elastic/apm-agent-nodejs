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
MIICETCCAXqgAwIBAgIQQalo5z3llnTiwERMPZQxujANBgkqhkiG9w0BAQsFADAS
MRAwDgYDVQQKEwdBY21lIENvMCAXDTcwMDEwMTAwMDAwMFoYDzIwODQwMTI5MTYw
MDAwWjASMRAwDgYDVQQKEwdBY21lIENvMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCB
iQKBgQDrW9Z8jSgTMeN9Dt36HBj/kbU/aeFp10GshKm8IKWBpyyWKrTSjiYJIpTK
l/6sdC77UCDokYAk66T+IXIvvRvqOtD1HUt+KLlqZ7acunTp1Qq4PnASHBm9fdKs
F1c8gWlEXOMzCsC5BmokcijW7z8JTKszAVi2vpq5MHbtYxZXKQIDAQABo2YwZDAO
BgNVHQ8BAf8EBAMCAqQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH/BAUw
AwEB/zAsBgNVHREEJTAjgglsb2NhbGhvc3SHBH8AAAGHEAAAAAAAAAAAAAAAAAAA
AAEwDQYJKoZIhvcNAQELBQADgYEA4yzI/6gjkACdvrnlFm/MJlDQztPYYEAtQ6Sp
0q0PMQcynLfhH94KMjxJb31HNPJYXr7UrE6gwL2sUnfioXUTQTk35okpphR8MGu2
hZ704px4wdeK/9B5Vh96oMZLYhm9SXizRVAZz7bPFYNMrhyk9lrWZXOaX526w4wI
Y5LTiUQ=
-----END CERTIFICATE-----`;

const tlsKey = `-----BEGIN PRIVATE KEY-----
MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAOtb1nyNKBMx430O
3focGP+RtT9p4WnXQayEqbwgpYGnLJYqtNKOJgkilMqX/qx0LvtQIOiRgCTrpP4h
ci+9G+o60PUdS34ouWpntpy6dOnVCrg+cBIcGb190qwXVzyBaURc4zMKwLkGaiRy
KNbvPwlMqzMBWLa+mrkwdu1jFlcpAgMBAAECgYEAtZc9LQooIm86izHeWOw26XD9
u/iwf94igL42y70QlbFreE1pCI++jwvMa2fMijh2S1bunSIuEc5yldUuaeDp2FtJ
k7U9orbJspnWy6ixk1KgpjffdHP73r4S3a5G81G8sq9Uvwl0vxF90eTvg9C7kUfk
J1YMy4zcpLtwkCHEkNUCQQDx79t6Dqswi8vDoS0+MCIJNCO4J49ZchL8aXE8n9GT
mF+eOsKy6e5qYH0oYPpeXchwf1tWhX1gBCb3fXrtOoPTAkEA+QoX9S1XofY8YS1M
iNVVSkLjpKgVoTQVe4j+vj16NHouVQ+oOvEUca2LTrHRx+utdar1NSexl51NO0Lj
3sqnkwJAPNWCC3Pqyb8tEljRxoRV2piYrrKL0gLkEUH2LjdFfGZhDKlb0Z8OywLO
Fbwk2FuejeMINX5FY0JIBg0wPrxq7wJAMoot2n/dLO0/y6jZw1sn9+4jLKM/4Hsl
cPCYYhsv1b6F8JVA2tVaBMfnYY0MubnGdf6/zI3FqLMvnTsx62DNKQJBAMYUaw/D
plXTexeEU/c0BRxQdOkGmDqOQtnuRQUCQq6gu+occTeilgFoKHWT3QcZHIpHxawJ
N2K67EWPRgr3suE=
-----END PRIVATE KEY-----`;
