/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test Client.prototype._getBackoffDelay.

const test = require('tape');

const { HttpApmClient } = require('../../../lib/apm-client/http-apm-client');
const { validOpts } = require('./lib/utils');

function assertDelayWithinTenPercentOf(t, value, target, context) {
  const jitter = target * 0.1;
  t.ok(
    target - jitter <= value && value <= target + jitter,
    `delay ~ ${target}ms ${context}, got ${value}`,
  );
}

test('_getBackoffDelay', function (t) {
  const client = new HttpApmClient(validOpts());

  // From https://github.com/elastic/apm/blob/main/specs/agents/transport.md#transport-errors
  // "The grace period should be calculated in seconds using the algorithm
  // min(reconnectCount++, 6) ** 2 ± 10%, where reconnectCount starts at zero.
  // So the delay after the first error is 0 seconds, then circa 1, 4, 9, 16, 25
  // and finally 36 seconds. We add ±10% jitter to the calculated grace period
  // in case multiple agents entered the grace period simultaneously."
  t.equal(client._getBackoffDelay(false), 0, 'no backoff delay with no errors');
  t.equal(client._getBackoffDelay(true), 0, 'delay=0 after one error');
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    1000,
    'after one error',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    4000,
    'after two errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    9000,
    'after three errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    16000,
    'after four errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    25000,
    'after five errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    36000,
    'after six errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    36000,
    'after seven or more errors',
  );
  assertDelayWithinTenPercentOf(
    t,
    client._getBackoffDelay(true),
    36000,
    'after seven or more errors',
  );
  t.equal(
    client._getBackoffDelay(false),
    0,
    'delay back to 0ms after a success',
  );

  t.end();
});
