/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const agent = require('../..').start({
  metricsInterval: 0,
  centralConfig: false,
  logUncaughtExceptions: true,
});

const test = require('tape');

const origConsoleError = console.error;
const origCaptureErorr = agent.captureError;
const origSendError = agent._apmClient.sendError;

test('should capture and log uncaught exceptions by default', function (t) {
  t.plan(8);

  t.on('end', function () {
    console.error = origConsoleError;
    agent.captureError = origCaptureErorr;
    agent._apmClient.sendError = origSendError;
  });

  console.error = function (loggedError) {
    t.strictEqual(loggedError, thrownError, 'should log the error to STDERR');
    return origConsoleError.apply(this, arguments);
  };

  agent.captureError = function (caughtError) {
    t.strictEqual(caughtError, thrownError, 'should capture the error');
    return origCaptureErorr.apply(this, arguments);
  };

  agent._apmClient.sendError = function (sentError) {
    t.strictEqual(sentError.exception.message, thrownError.message);
    t.strictEqual(sentError.exception.type, 'Error');
    t.strictEqual(sentError.exception.handled, false);
    t.ok(
      Array.isArray(sentError.exception.stacktrace),
      'should have a stack trace',
    );
    t.ok(
      sentError.exception.stacktrace.length > 0,
      'stack trace should contain frames',
    );
    t.ok(
      __filename.includes(sentError.exception.stacktrace[0].filename),
      'top frame should be this file',
    );
  };

  // Re-install the Agent's default (captureExceptions=true) uncaughtException
  // handler, but with a *callback* so this test is called back instead of
  // the Agent default of `process.exit(1)`. A process.exit breaks this test.
  agent.handleUncaughtExceptions((_err) => {
    t.end();
  });

  const thrownError = new Error('foo');

  throw thrownError;
});
