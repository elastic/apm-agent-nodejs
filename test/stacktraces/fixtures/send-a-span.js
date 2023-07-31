/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Send a span so we can test that it has a `span.stacktrace`.

const agent = require('../../../').start({
  serviceName: 'test-send-a-span',
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  // These tell the agent to add source lines of context.
  sourceLinesSpanAppFrames: 5,
  sourceLinesSpanLibraryFrames: 5,
});

function a(cb) {
  setImmediate(cb);
}

function main() {
  const trans = agent.startTransaction('main');
  const span = agent.startSpan('a');
  a(function () {
    span.end();
    trans.end();
  });
}

main();
