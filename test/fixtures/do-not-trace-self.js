/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// A small APM-using script used to test that the APM agent's own HTTP
// communication with APM server is not traced.

var apm = require('../../').start({
  // elastic-apm-node
  serviceName: 'test-do-not-trace-self',
  metricsInterval: 0,
  apmServerVersion: '8.0.0',
  cloudProvider: 'none',
  centralConfig: false,
});

// Explicitly require the possible APM server client transport modules so that
// the agent instruments them.
require('http');
require('https');

// Start a transaction and intentionally do not end it. We expect the APM agent
// end-of-process handling will flush the ended *span*... while there is still
// this current transaction. This creates the potential for the agent to
// incorrectly trace its own HTTP request to APM server.
apm.startTransaction('transactionThatWeDoNotEnd');
setImmediate(function () {
  const s = apm.startSpan('s');
  setImmediate(function () {
    s.end();
  });
});
