/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Capture an error whose stack has duplicate frames, then capture the same
// error again. The goal is to try to trigger a bug in serialization of
// cached `error.exception.stacktrace` frames where duplicate frames are
// serialized as `"[Circular]"`.

const apm = require('../../../').start({
  serviceName: 'test-throw-an-error',
  captureExceptions: false,
  logUncaughtExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
  logLevel: 'off',
});

function boomOnZero(n) {
  if (--n <= 0) {
    throw new Error('boom on zero');
  } else {
    boomOnZero(n);
  }
}

function main() {
  // This setInterval is somewhat of a hack to avoid a problem with the
  // elastic-apm-http-client's "smart" auto-end functionality. Without this
  // interval, node.js will think it is time to exit the process during the
  // processing of the first `apm.captureError()` below, because there will be
  // no outstanding timers/sockets/etc. That results in the "beforeExit" process
  // event, which is used by elastic-apm-http-client to gracefully exit
  // (calling `this.end()`). *Then* a second `apm.captureError()` comes along
  // and the result is:
  //    APM Server transport error: Error: write after end
  //      at writeAfterEnd (.../node_modules/elastic-apm-http-client/node_modules/readable-stream/lib/_stream_writable.js:261:12)
  //      at Client.Writable.write (.../node_modules/elastic-apm-http-client/node_modules/readable-stream/lib/_stream_writable.js:305:21)
  //      at Client.sendError (.../node_modules/elastic-apm-http-client/index.js:562:15)
  const avoidBeforeExitInterval = setInterval(function () {}, 1000);

  try {
    boomOnZero(10);
  } catch (err1) {
    console.log('calling captureError() for first a()');
    apm.captureError(err1, { message: 'a() blew up first time' }, () => {
      // The goal is to `captureError` a second time *after* there are
      // stacktrace frames in the internal `frameCache`. One way to ensure
      // there has been time for those to be generated and cached is to wait
      // for the `captureError()` to be complete, by waiting for its callback.
      try {
        boomOnZero(10);
      } catch (err2) {
        console.log('calling captureError() for second a()');
        apm.captureError(err2, { message: 'a() blew up second time' }, () => {
          console.log('done');
          clearInterval(avoidBeforeExitInterval);
        });
      }
    });
  }
}

main();
