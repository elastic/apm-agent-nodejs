/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// This is used in test/side-effects.js to ensure that a Client with a
// (sometimes long-lived) request open to APM server does *not* keep a node
// process alive.

const { HttpApmClient } = require('../../../../lib/apm-client/http-apm-client');

const client = new HttpApmClient({
  // logger: require('pino')({ level: 'trace' }, process.stderr), // uncomment for debugging
  serverUrl: process.argv[2],
  secretToken: 'secret',
  agentName: 'my-agent-name',
  agentVersion: 'my-agent-version',
  serviceName: 'my-service-name',
  userAgent: 'my-user-agent',
});

process.stdout.write(String(Date.now()) + '\n');

client.sendSpan({ hello: 'world' }); // Don't end the stream
