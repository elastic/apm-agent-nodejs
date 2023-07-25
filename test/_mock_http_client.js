/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// This is a mock "elastic-apm-http-client".
//
// Usage:
//
// 1. Create a client for an expected number of writes:
//
//      var mockClient = require('.../_mock_http_client')
//      agent._apmClient = mockClient(expected, done)
//
//    The `done` callback will be called with the written data (`_writes`)
//    once the `expected` number of writes have occurred.
//
// 2. Create a client that calls back after a delay without writes:
//
//      var mockClient = require('.../_mock_http_client')
//      agent._apmClient = mockClient(done)
//
//    The `done` callback will be called with the written data (`_writes`)
//    after a 200ms delay with no writes (the timer only starts after the
//    first write).
module.exports = function (expected, done) {
  const timerBased = typeof expected === 'function';
  if (timerBased) done = expected;
  let timer;

  const client = {
    _writes: {
      length: 0,
      spans: [],
      transactions: [],
      errors: [],
      metricsets: [],
    },
    _write(obj, cb) {
      cb = cb || noop;

      const type = Object.keys(obj)[0];
      this._writes.length++;
      this._writes[type + 's'].push(obj[type]);

      process.nextTick(cb);

      if (timerBased) resetTimer();
      else if (this._writes.length === expected) done(this._writes);
      else if (this._writes.length > expected)
        throw new Error('too many writes');
    },
    sendSpan(span, cb) {
      this._write({ span }, cb);
    },
    sendTransaction(transaction, cb) {
      this._write({ transaction }, cb);
    },
    sendError(error, cb) {
      this._write({ error }, cb);
    },
    sendMetricSet(metricset, cb) {
      this._write({ metricset }, cb);
    },
    flush(opts, cb) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      } else if (!opts) {
        opts = {};
      }
      if (cb) process.nextTick(cb);
    },
    supportsKeepingUnsampledTransaction() {
      return true;
    },
    supportsActivationMethodField() {
      return true;
    },
  };

  return client;

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      done(client._writes);
    }, 200);
  }
};

function noop() {}
