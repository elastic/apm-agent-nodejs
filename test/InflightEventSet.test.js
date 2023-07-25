/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var tape = require('tape');

const { InflightEventSet } = require('../lib/InflightEventSet');

tape.test('InflightEventSet normal operation', function (t) {
  const inflight = new InflightEventSet();
  inflight.add('a');
  inflight.setDrainHandler((err) => {
    t.pass(true, 'drain handler was called');
    t.error(err, 'no error to drain handler');
    t.end();
  });
  inflight.add('b');
  inflight.delete('a');
  inflight.delete('b');
});

// If no drain handler is added, nothing should blow up.
tape.test('InflightEventSet no drain handler', function (t) {
  const inflight = new InflightEventSet();
  inflight.add('a');
  inflight.add('b');
  inflight.delete('a');
  inflight.delete('b');
  t.pass('nothing happened when set emptied');
  t.end();
});

tape.test('InflightEventSet timeout', function (t) {
  const timeoutMs = 1000;
  const tooSlow = setTimeout(() => {
    t.fail('took too long for drain handler timeout');
  }, 2 * timeoutMs);

  const inflight = new InflightEventSet();
  inflight.add('a');
  const startTime = Date.now();
  inflight.setDrainHandler((err) => {
    const endTime = Date.now();
    t.pass('drain handler was called');
    t.ok(err, 'got an error from drain handler');
    t.ok(
      Math.abs(endTime - startTime - timeoutMs) < 100,
      `time to timeout was near ${timeoutMs}ms (was ${endTime - startTime}ms)`,
    );
    clearTimeout(tooSlow);
    t.end();
  }, timeoutMs);
  inflight.add('b');
  inflight.delete('a');
  // 'b' is never removed, so the inflight event set should timeout after ~1s.
});
