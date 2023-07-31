/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A script, used by test/side-effects.js, to test that the client.flush
// callback is called.
//
// We expect both `console.log`s to write their output.
//
// Two important things are required to reproduce the issue:
// 1. There cannot be other activities going on that involve active libuv
//    handles. For this Client that means:
//    - ensure no `_pollConfig` requests via `centralConfig: false`
//    - do not provide a `cloudMetadataFetcher`
//    - set `apmServerVersion` to not have an APM Server version fetch request
// 2. There must be a listening APM server to which to send data.

const { HttpApmClient } = require('../../../../lib/apm-client/http-apm-client');

const serverUrl = process.argv[2];

const client = new HttpApmClient({
  // logger: require('pino')({ level: 'trace', ...require('@elastic/ecs-pino-format')() }, process.stderr), // uncomment for debugging
  serverUrl,
  serviceName: 'call-me-back-maybe',
  agentName: 'my-nodejs-agent',
  agentVersion: '1.2.3',
  userAgent: 'my-nodejs-agent/1.2.3',
  centralConfig: false, // important for repro, see above
  apmServerVersion: '8.0.0', // important for repro, see above
});

const e = { exception: { message: 'boom', type: 'Error' } };

client.sendError(e, function sendCb() {
  console.log('sendCb called');
  client.flush(function flushCb() {
    console.log('flushCb called');
  });
});
