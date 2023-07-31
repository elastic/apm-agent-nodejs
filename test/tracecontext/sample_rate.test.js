/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  transactionSampleRate: 1,
});

const suite = require('tape');

suite('Sample Rate Propagation', function (test) {
  const TRACEPARENT_RECORDED =
    '00-2b9e333caa56c38e6e4d682f3184da23-a6bea2be0b62fb54-01';
  const TRACEPARENT_NOTRECORDED =
    '00-c054b05d8262aaca165ed62e32898f55-4fcce7bf3ec36951-00';

  test.test('sample rate is set', function (t) {
    agent._conf.transactionSampleRate = 0.499;
    const transaction = startSampledTransaction();
    t.equals(transaction.sampleRate, 0.499, 'sample rate set');

    t.end();
  });

  test.test('prefers tracestate value', function (t) {
    const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
      childOf: TRACEPARENT_RECORDED,
      tracestate: 'es=s:0.7654321',
    });
    t.equals(transaction.sampleRate, 0.7654321, 'sample rate set');
    t.end();
  });

  // test that a sampled/recorded transaction produces spans and transactions
  // with a sampleRate property equal to the sample rate
  test.test('recorded transactions have sample rate', function (t) {
    const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
      childOf: TRACEPARENT_RECORDED,
      tracestate: 'es=s:0.7654321',
    });
    const span = transaction.startSpan('foo');
    t.equals(transaction.sampleRate, 0.7654321, 'sample rate set');
    t.equals(span.sampleRate, 0.7654321, 'sample rate set');
    t.end();
  });

  // test that a unsampled/unrecorded transaction produces a transaction
  // with a sampleRate property of 0, and produces no spans
  test.test('unrecorded transactions have a sample rate of 0', function (t) {
    const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
      childOf: TRACEPARENT_NOTRECORDED,
      tracestate: 'es=s:0',
    });
    const span = transaction.startSpan('foo');
    t.equals(transaction.sampleRate, 0, 'sample rate set');
    t.ok(!span, 'span not started');
    t.end();
  });

  // test that a sampled/recorded root transaction produces samples and
  // transactions with a sampleRate equal to the sample rate
  test.test(
    'recorded root transactions have correct sample rate',
    function (t) {
      agent._conf.transactionSampleRate = 1;
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing');
      const span = transaction.startSpan('foo');
      t.equals(transaction.sampleRate, 1, 'sample rate set');
      t.equals(span.sampleRate, 1, 'sample rate set');
      t.end();
    },
  );

  // test that an unsampled/unrecorded root  transaction produces a transaction
  // with a sampleRate property of 0, and produces no spans
  test.test(
    'unrecorded root transactions have a sample rate of 0',
    function (t) {
      agent._conf.transactionSampleRate = 0;
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing');
      const span = transaction.startSpan('foo');
      t.equals(transaction.sampleRate, 0, 'sample rate set');
      t.ok(!span, 'no span for unsampled transactions');
      t.end();
    },
  );

  // test that an unsampled transaction from a non-zero sample rate
  // still produces a final serialized span with a sample rate of 0
  test.test(
    'unrecorded root transactions "sample rate of 0" is preferred over "transactionSampleRate"',
    function (t) {
      agent._conf.transactionSampleRate = 0.1;

      const transaction = startUnSampledTransaction();
      const span = transaction.startSpan('foo');
      const serialized = transaction.toJSON();
      t.equals(serialized.sample_rate, 0, 'serialized sample rate is zero');
      t.ok(!span, 'no span for unsampled transactions');
      t.end();
    },
  );

  // Test that an invalid tracestate in a recorded transaction
  // results in a serialized span without a sampleRate, per the spec.
  test.test(
    'invalid tracestate with recorded transaction has no span.sample_rate',
    function (t) {
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
        childOf: TRACEPARENT_RECORDED,
        tracestate: 'notavalidtracestate',
      });
      const span = transaction.startSpan('foo');
      span.end();
      span._encode(function (err, spanSerialized) {
        t.error(err);
        const transactionSerialized = transaction.toJSON();

        t.equals(
          transactionSerialized.sample_rate,
          undefined,
          'serialized transaction should have no sample_rate',
        );
        t.equals(
          spanSerialized.sample_rate,
          undefined,
          'serialized span should have no sample_rate',
        );

        t.end();
      });
    },
  );

  // Test that a blank tracestate in a recorded transaction
  // results in a serialized span without a sample_rate, per the spec.
  test.test(
    'blank tracestate with a recorded transaction has no span.sample_rate',
    function (t) {
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
        childOf: TRACEPARENT_RECORDED,
        tracestate: '',
      });
      const span = transaction.startSpan('foo');
      span.end();
      span._encode(function (err, spanSerialized) {
        t.error(err);
        const transactionSerialized = transaction.toJSON();

        t.equals(
          transactionSerialized.sample_rate,
          undefined,
          'serialized transaction should have no sample_rate',
        );
        t.equals(
          spanSerialized.sample_rate,
          undefined,
          'serialized span should have no sample_rate',
        );

        t.end();
      });
    },
  );

  // Test that an invalid tracestate in an unrecorded transaction
  // results in a serialized span without a sample_rate, per the spec.
  test.test(
    'invalid tracestate with an unrecorded transaction has no span.sample_rate',
    function (t) {
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
        childOf: TRACEPARENT_NOTRECORDED,
        tracestate: 'notavalidtracestate',
      });
      const span = transaction.startSpan('foo');
      const transactionSerialized = transaction.toJSON();
      t.equals(
        transactionSerialized.sample_rate,
        undefined,
        'serialized transaction should have no sample_rate',
      );
      t.ok(!span, 'no span for unsampled transaction');
      t.end();
    },
  );

  // Test that a blank tracestate in an unrecorded transaction
  // results in a serialized span without a sample_rate, per the spec.
  test.test(
    'invalid tracestate with an unrecorded transaction has no span.sample_rate',
    function (t) {
      const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
        childOf: TRACEPARENT_NOTRECORDED,
        tracestate: '',
      });
      const span = transaction.startSpan('foo');
      const transactionSerialized = transaction.toJSON();
      t.equals(
        transactionSerialized.sample_rate,
        undefined,
        'serialized transaction should have no sample_rate',
      );
      t.ok(!span, 'no span for unsampled transaction');
      t.end();
    },
  );

  test.test('non-number trace state', function (t) {
    const transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing', {
      childOf: TRACEPARENT_NOTRECORDED,
      tracestate: 'es=s:foo',
    });
    t.equals(transaction.sampleRate, null, 'invalid sample rate returns null');
    t.end();
  });
  test.end();
});

// returns a sampled transaction
//
// Some testing scenarios require us to test the behavior of the
// the agent when a root transaction is sampled.  Whether a root transaction
// is sampled or not has an element of randomness to it.  This function
// will keep trying to start a transaction until we have one that's
// sampled/recorded
//
// @return {Transaction}
function startSampledTransaction() {
  let transaction = { sampled: false };
  let guardCount = 0;
  while (!transaction.sampled && guardCount < 10000) {
    transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing');
    guardCount++;
  }
  if (guardCount >= 10000) {
    throw new Error(
      'startSampledTransaction could not start a sampled transaction',
    );
  }
  return transaction;
}

// returns an unsampled transaction
//
// Some testing scenarios require us to test the behavior of the
// the agent when a root transaction is not sampled.  Whether a root transaction
// is sampled or not has an element of randomness to it.  This function
// will keep trying to start a transaction until we have one that's
// unsampled/unrecorded
//
// @return {Transaction}
function startUnSampledTransaction() {
  let transaction = { sampled: true };
  let guardCount = 0;
  while (transaction.sampled && guardCount < 10000) {
    transaction = agent.startTransaction('foo', 'bar', 'baz', 'bing');
    guardCount++;
  }
  if (guardCount >= 10000) {
    throw new Error(
      'startUnSampledTransaction could not start an unsampled transaction',
    );
  }
  return transaction;
}
