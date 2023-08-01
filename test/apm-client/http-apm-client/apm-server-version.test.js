/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test that fetching the APM Server version works as expected.
//
// Notes:
// - Testing that the APM Server version fetch request does not hold the
//   process open is tested in "side-effects.test.js".

const test = require('tape');
const { APMServer, validOpts } = require('./lib/utils');
const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');

test('no APM server version fetch if apmServerVersion is given', function (t) {
  t.plan(1);
  const server = APMServer(function (req, res) {
    t.fail(
      `there should not be an APM server request: ${req.method} ${req.url}`,
    );
  }).client({ apmServerVersion: '8.0.0' }, function (client) {
    setTimeout(() => {
      t.pass('made it to timeout with no APM server request');
      server.close();
      client.destroy();
      t.end();
    }, 100);
  });
});

test('APM server version fetch works for "6.6.0"', function (t) {
  const server = APMServer(function (req, res) {
    t.equal(req.method, 'GET');
    t.equal(req.url, '/', 'got APM Server information API request');

    res.writeHead(200);
    const verInfo = {
      build_date: '2021-09-16T02:05:39Z',
      build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
      version: '6.6.0',
    };
    // Pre-7.0.0 versions of APM Server responded with this body:
    res.end(JSON.stringify({ ok: verInfo }));
  }).client({}, function (client) {
    t.strictEqual(
      client._apmServerVersion,
      undefined,
      'client._apmServerVersion is undefined immediately after client creation',
    );
    t.equal(
      client.supportsKeepingUnsampledTransaction(),
      true,
      'client.supportsKeepingUnsampledTransaction() defaults to true before fetch',
    );
    t.equal(
      client.supportsActivationMethodField(),
      true,
      'client.supportsActivationMethodField() defaults to true before fetch',
    );

    // Currently there isn't a mechanism to wait for the fetch request, so for
    // now just wait a bit.
    setTimeout(() => {
      t.ok(client._apmServerVersion, 'client._apmServerVersion is set');
      t.equal(client._apmServerVersion.toString(), '6.6.0');
      t.equal(
        client.supportsKeepingUnsampledTransaction(),
        true,
        'client.supportsKeepingUnsampledTransaction() is true after fetch',
      );
      t.equal(
        client.supportsActivationMethodField(),
        false,
        'client.supportsActivationMethodField() is false after fetch',
      );

      server.close();
      client.destroy();
      t.end();
    }, 200);
  });
});

test('APM server version fetch works for "7.16.0"', function (t) {
  const server = APMServer(function (req, res) {
    t.equal(req.method, 'GET');
    t.equal(req.url, '/', 'got APM Server information API request');

    res.writeHead(200);
    const verInfo = {
      build_date: '2021-09-16T02:05:39Z',
      build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
      version: '7.16.0',
    };
    res.end(JSON.stringify(verInfo, null, 2));
  }).client({}, function (client) {
    t.strictEqual(
      client._apmServerVersion,
      undefined,
      'client._apmServerVersion is undefined immediately after client creation',
    );
    t.equal(
      client.supportsKeepingUnsampledTransaction(),
      true,
      'client.supportsKeepingUnsampledTransaction() defaults to true before fetch',
    );

    // Currently there isn't a mechanism to wait for the fetch request, so for
    // now just wait a bit.
    setTimeout(() => {
      t.ok(client._apmServerVersion, 'client._apmServerVersion is set');
      t.equal(client._apmServerVersion.toString(), '7.16.0');
      t.equal(
        client.supportsKeepingUnsampledTransaction(),
        true,
        'client.supportsKeepingUnsampledTransaction() is true after fetch',
      );

      server.close();
      client.destroy();
      t.end();
    }, 200);
  });
});

test('APM server version fetch works for "8.0.0"', function (t) {
  const server = APMServer(function (req, res) {
    t.equal(req.method, 'GET');
    t.equal(req.url, '/', 'got APM Server information API request');

    res.writeHead(200);
    const verInfo = {
      build_date: '2021-09-16T02:05:39Z',
      build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
      version: '8.0.0',
    };
    res.end(JSON.stringify(verInfo, null, 2));
  }).client({}, function (client) {
    t.strictEqual(
      client._apmServerVersion,
      undefined,
      'client._apmServerVersion is undefined immediately after client creation',
    );
    t.equal(
      client.supportsKeepingUnsampledTransaction(),
      true,
      'client.supportsKeepingUnsampledTransaction() defaults to true before fetch',
    );

    // Currently there isn't a mechanism to wait for the fetch request, so for
    // now just wait a bit.
    setTimeout(() => {
      t.ok(client._apmServerVersion, 'client._apmServerVersion is set');
      t.equal(client._apmServerVersion.toString(), '8.0.0');
      t.equal(
        client.supportsKeepingUnsampledTransaction(),
        false,
        'client.supportsKeepingUnsampledTransaction() is false after fetch',
      );

      server.close();
      client.destroy();
      t.end();
    }, 200);
  });
});

/**
 * APM server 8.7.0 included a bug where APM agents sending `activation_method`
 * was harmful. This test ensures we don't send that field to v8.7.0.
 *
 * See https://github.com/elastic/apm/pull/780
 */
test('APM server version fetch works for "8.7.0"', function (t) {
  const server = APMServer(function (req, res) {
    res.writeHead(200);
    const verInfo = {
      build_date: '2023-03-30T22:17:50Z',
      build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
      version: '8.7.0',
    };
    res.end(JSON.stringify(verInfo, null, 2));
  }).client(
    {
      agentActivationMethod: 'env-attach',
    },
    function (client) {
      t.strictEqual(
        client._apmServerVersion,
        undefined,
        'client._apmServerVersion is undefined immediately after client creation',
      );
      t.equal(
        client._conf.agentActivationMethod,
        'env-attach',
        '_conf.agentActivationMethod',
      );
      t.equal(
        client.supportsActivationMethodField(),
        true,
        'client.supportsActivationMethodField() defaults to true before fetch',
      );
      t.ok(
        'activation_method' in
          JSON.parse(client._encodedMetadata).metadata.service.agent,
        'metadata includes "activation_method" before fetch',
      );

      // Currently there isn't a mechanism to wait for the fetch request, so for
      // now just wait a bit.
      setTimeout(() => {
        t.ok(client._apmServerVersion, 'client._apmServerVersion is set');
        t.equal(client._apmServerVersion.toString(), '8.7.0');
        t.equal(
          client.supportsActivationMethodField(),
          false,
          'client.supportsActivationMethodField() is false after fetch',
        );
        t.equal(
          JSON.parse(client._encodedMetadata).metadata.service.agent
            .activation_method,
          undefined,
          'metadata does not include "activation_method" after fetch',
        );

        server.close();
        client.destroy();
        t.end();
      }, 200);
    },
  );
});

/**
 * Starting with APM server 8.7.1, `activation_method` should be sent.
 * See https://github.com/elastic/apm/pull/780
 */
test('APM server version fetch works for "8.7.1"', function (t) {
  const server = APMServer(function (req, res) {
    res.writeHead(200);
    const verInfo = {
      build_date: '2023-03-30T22:17:50Z',
      build_sha: 'a183f675ecd03fca4a897cbe85fda3511bc3ca43',
      version: '8.7.1',
    };
    res.end(JSON.stringify(verInfo, null, 2));
  }).client(
    {
      agentActivationMethod: 'env-attach',
    },
    function (client) {
      t.strictEqual(
        client._apmServerVersion,
        undefined,
        'client._apmServerVersion is undefined immediately after client creation',
      );
      t.equal(
        client._conf.agentActivationMethod,
        'env-attach',
        '_conf.agentActivationMethod',
      );
      t.equal(
        client.supportsActivationMethodField(),
        true,
        'client.supportsActivationMethodField() defaults to true before fetch',
      );
      t.ok(
        'activation_method' in
          JSON.parse(client._encodedMetadata).metadata.service.agent,
        'metadata includes "activation_method" before fetch',
      );

      // Currently there isn't a mechanism to wait for the fetch request, so for
      // now just wait a bit.
      setTimeout(() => {
        t.ok(client._apmServerVersion, 'client._apmServerVersion is set');
        t.equal(client._apmServerVersion.toString(), '8.7.1');
        t.equal(
          client.supportsActivationMethodField(),
          true,
          'client.supportsActivationMethodField() is true after fetch',
        );
        t.equal(
          JSON.parse(client._encodedMetadata).metadata.service.agent
            .activation_method,
          'env-attach',
          'metadata includes "activation_method" after fetch',
        );

        server.close();
        client.destroy();
        t.end();
      }, 200);
    },
  );
});

test('APM server version is null on fetch error', function (t) {
  const HOPEFULLY_UNUSED_PORT_HACK = 62345;
  const client = new HttpApmClient(
    validOpts({
      serverUrl: 'http://localhost:' + HOPEFULLY_UNUSED_PORT_HACK,
    }),
  );
  client.on('request-error', (err) => {
    t.ok(err, 'got a "request-error" event');
    t.ok(
      /error fetching APM Server version/.test(err.message),
      'error message is about APM Server version fetching',
    );
    t.strictEqual(client._apmServerVersion, null, 'client._apmServerVersion');
    t.equal(
      client.supportsKeepingUnsampledTransaction(),
      true,
      'client.supportsKeepingUnsampledTransaction() defaults to true after failed fetch',
    );

    client.destroy();
    t.end();
  });
});
