#!/usr/bin/env node

/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// A small example showing Elastic APM tracing of a script using `@hapi/hapi`.
//
// Usage:
//    node examples/trace-hapi.js
//    curl -i http://localhost:3000/  # call the '/' handler

const apm = require('../').start({
  serviceName: 'example-trace-hapi',
});

const Hapi = require('@hapi/hapi');

const init = async () => {
  const server = Hapi.server({ port: 3000, host: 'localhost' });

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      // APM's instrumentation of Node's core "http" module automatically
      // creates a transaction for each request.
      server.log('info', 'hi to server.log from route /');
      request.log('info', 'handling route /');
      return 'hi';
    },
  });

  // `server.log(...)` calls in the context of a request will have access to
  // the APM transaction for this HTTP request (`apm.currentTransaction` et al).
  server.events.on('log', (event, tags) => {
    console.log('log event: traceIds=%j %j', apm.currentTraceIds, event.data);
  });

  // Called for `request.log(...)` calls.
  server.events.on('request', (request, event, tags) => {
    console.log(
      'request event: traceIds=%j %j',
      apm.currentTraceIds,
      event.data,
    );
  });

  // The 'response' event is emitted after the Node HTTP response has ended
  // and the APM instrumentation has ended the APM transaction, so there will
  // be no currentTransaction.
  server.events.on('response', (request) => {
    console.log(
      'response event: traceIds=%j requestId=%s active=%s',
      apm.currentTraceIds,
      request.info.id,
      request.active(),
    );
  });

  // 'server.ext(...)' allows one to integrate in the Hapi request lifecycle.
  // The 'onPreResponse' lifecycle event allows one to call the APM Transaction
  // API before the response is complete.
  server.ext('onPreResponse', (request, h) => {
    console.log(
      'onPreResponse: traceIds=%j requestId=%s active=%s',
      apm.currentTraceIds,
      request.info.id,
      request.active(),
    );
    return h.continue;
  });

  await server.start();
  console.log(
    'Server running. Run "curl -i http://localhost:3000/" to call it.',
    server.info.uri,
  );
};

init();
