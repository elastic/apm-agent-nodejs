/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the behavior of the `spanStackTraceMinDuration` config option.

const tape = require('tape');
const agent = require('..').start({
  disableSend: true,
  logLevel: 'off',
});

tape.test(
  'spanStackTraceMinDuration default is no span.stacktrace, even if over 10ms duration',
  function (t) {
    const trans = agent.startTransaction('myTrans');
    const span = agent.startSpan('mySpan');
    setTimeout(function () {
      span.end();
      trans.end();
      span._encode(function (err, data) {
        t.error(err);
        t.ok(!data.stacktrace, 'stacktrace not set');
        t.end();
      });
    }, 20);
  },
);

tape.test(
  'span faster than configured spanStackTraceMinDuration should have no stacktrace',
  function (t) {
    agent._config({ spanFramesMinDuration: '100ms' });
    const trans = agent.startTransaction('myTrans');
    const span = agent.startSpan('mySpan');
    setTimeout(function () {
      span.end();
      trans.end();
      span._encode(function (err, data) {
        t.error(err);
        t.ok(!data.stacktrace, 'stacktrace not set');
        t.end();
      });
    }, 50);
  },
);

tape.test(
  'span slower than configured spanStackTraceMinDuration should have stacktrace',
  function (t) {
    agent._config({ spanStackTraceMinDuration: '100ms' });
    const trans = agent.startTransaction('myTrans');
    const span = agent.startSpan('mySpan');
    setTimeout(function () {
      span.end();
      trans.end();
      span._encode(function (err, data) {
        t.error(err);
        t.ok(data.stacktrace, 'stacktrace set');
        t.end();
      });
    }, 101);
  },
);

tape.test(
  'spanStackTraceMinDuration=<negative> means no span stack traces',
  function (t) {
    agent._config({ spanStackTraceMinDuration: -42 });
    const trans = agent.startTransaction('myTrans');
    const span = agent.startSpan('mySpan');
    setImmediate(function () {
      span.end();
      trans.end();
      span._encode(function (err, data) {
        t.error(err);
        t.ok(!data.stacktrace, 'stacktrace is not set');
        t.end();
      });
    });
  },
);

tape.test(
  'spanFramesMinDuration=<zero> means always have span stack traces',
  function (t) {
    agent._config({ spanStackTraceMinDuration: '0s' });
    const trans = agent.startTransaction('myTrans');
    const span = agent.startSpan('mySpan');
    setTimeout(function () {
      span.end();
      trans.end();
      span._encode(function (err, data) {
        t.error(err);
        t.ok(data.stacktrace, 'stacktrace is set');
        t.end();
      });
    }, 200);
  },
);
