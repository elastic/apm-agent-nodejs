/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Load and start the APM agent.
//
// Note: Currently this will *not* start the agent in Worker threads because
// that is arguably not desired default behavior when using:
//    node --require=elastic-apm-node/start.js ...

const apm = require('./');

var isMainThread;
try {
  var workerThreads = require('worker_threads');
  isMainThread = workerThreads.isMainThread;
} catch (_importErr) {
  // worker_threads were added in node 12 and behind a flag in node ^10.5.0.
  isMainThread = true;
}
if (isMainThread) {
  apm.start();
}

module.exports = apm;
