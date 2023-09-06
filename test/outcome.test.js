/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
var agent = require('..').start({
  serviceName: 'test-outcome',
  captureExceptions: true,
  metricsInterval: 0,
  centralConfig: false,
});
const constants = require('../lib/constants');

const noOpClient = {
  _write() {},
  sendSpan() {},
  sendTransaction() {},
  sendError() {},
  sendMetricSet() {},
  flush() {},
  supportsKeepingUnsampledTransaction() {
    return true;
  },
  supportsActivationMethodField() {
    return true;
  },
};
agent._apmClient = noOpClient;

const suite = require('tape');

suite('span outcome tests', function (test) {
  test.test('span starts unknown, ends with success', function (t) {
    agent.startTransaction('foo', 'type');
    const span = agent.startSpan();
    t.equals(
      span.outcome,
      constants.OUTCOME_UNKNOWN,
      'spans start with unknown outcome',
    );
    span.end();
    agent.endTransaction();
    t.equals(span.outcome, constants.OUTCOME_SUCCESS, 'spans without errors');
    t.end();
  });

  test.test(
    "span starts unknown, and ends unknowns if it's not ended",
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'span that does not end has unknown outcome',
      );
      t.end();
    },
  );

  test.test(
    'span starts unknown, and ends with failure if error captured',
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      agent.captureError(new Error('this is an error'));
      span.end();
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_FAILURE,
        "if an error is captured, current span's outcome is failure",
      );
      t.end();
    },
  );

  test.test(
    "test that external span's value is a success if not explicatly set",
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      span.setType('external');
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      span.end();
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_SUCCESS,
        "external spans don't change on end",
      );
      t.end();
    },
  );

  test.end();
});

suite('API span.setOutcome tests', function (test) {
  test.test('API set value will be honored over non-API value', function (t) {
    agent.startTransaction('foo', 'type');
    const span = agent.startSpan();
    t.equals(
      span.outcome,
      constants.OUTCOME_UNKNOWN,
      'spans start with unknown outcome',
    );
    span.setOutcome(constants.OUTCOME_FAILURE);
    span.end();
    agent.endTransaction();
    t.equals(span.outcome, constants.OUTCOME_FAILURE, 'respects API set value');
    t.end();
  });

  test.test(
    'API set value wil be honored over non-API with error',
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      span.setOutcome(constants.OUTCOME_SUCCESS);
      agent.captureError(new Error('this is an error'));
      span.end();
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_SUCCESS,
        'respects API set value, ignore error',
      );
      t.end();
    },
  );

  test.test(
    'API set value of unknown will override normal success',
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      span.setOutcome(constants.OUTCOME_UNKNOWN);
      span.end();
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'respects API set value',
      );
      t.end();
    },
  );

  test.end();
});

suite('API span.setOutcome tests', function (test) {
  test.test('API set value will be honored over non-API value', function (t) {
    agent.startTransaction('foo', 'type');
    const span = agent.startSpan();
    t.equals(
      span.outcome,
      constants.OUTCOME_UNKNOWN,
      'spans start with unknown outcome',
    );
    span.setOutcome(constants.OUTCOME_FAILURE);
    span.end();
    agent.endTransaction();
    t.equals(span.outcome, constants.OUTCOME_FAILURE, 'respects API set value');
    t.end();
  });

  test.test(
    'API set value wil be honored over non-API with error',
    function (t) {
      agent.startTransaction('foo', 'type');
      const span = agent.startSpan();
      t.equals(
        span.outcome,
        constants.OUTCOME_UNKNOWN,
        'spans start with unknown outcome',
      );
      span.setOutcome(constants.OUTCOME_SUCCESS);
      agent.captureError(new Error('this is an error'));
      span.end();
      agent.endTransaction();
      t.equals(
        span.outcome,
        constants.OUTCOME_SUCCESS,
        'respects API set value, ignore error',
      );
      t.end();
    },
  );

  test.test('set value of unknown will override normal success', function (t) {
    agent.startTransaction('foo', 'type');
    const span = agent.startSpan();
    t.equals(
      span.outcome,
      constants.OUTCOME_UNKNOWN,
      'spans start with unknown outcome',
    );
    span.setOutcome(constants.OUTCOME_UNKNOWN);
    span.end();
    agent.endTransaction();
    t.equals(span.outcome, constants.OUTCOME_UNKNOWN, 'respects API set value');
    t.end();
  });

  test.test('API calls ignored after a span has ended', function (t) {
    agent.startTransaction('foo', 'type');
    const span = agent.startSpan();
    t.equals(
      span.outcome,
      constants.OUTCOME_UNKNOWN,
      'spans start with unknown outcome',
    );
    span.end();
    span.setOutcome(constants.OUTCOME_UNKNOWN);
    agent.endTransaction();
    t.equals(
      span.outcome,
      constants.OUTCOME_SUCCESS,
      'does not set outcome after span has ended',
    );
    t.end();
  });

  test.end();
});

suite('API transaction.setOutcome tests', function (test) {
  test.test('transaction defaults to unknown', function (t) {
    const transaction = agent.startTransaction('foo', 'type');
    agent.endTransaction();
    t.equals(transaction.outcome, constants.OUTCOME_UNKNOWN, 'make it');
    t.end();
  });

  test.test('transaction status code >= 500 is a failure', function (t) {
    const transaction = agent.startTransaction('foo', 'type');
    transaction._setOutcomeFromHttpStatusCode(500);
    agent.endTransaction();
    t.equals(transaction.outcome, constants.OUTCOME_FAILURE, '500 is an error');
    t.end();
  });

  test.test('transaction status code < 400 is a success', function (t) {
    const transaction = agent.startTransaction('foo', 'type');
    transaction._setOutcomeFromHttpStatusCode(499);
    agent.endTransaction();
    t.equals(
      transaction.outcome,
      constants.OUTCOME_SUCCESS,
      '499 is a success',
    );
    t.end();
  });

  test.test(
    'transaction public API setOutcome "wins" over internal APIs',
    function (t) {
      const transactionSuccess = agent.startTransaction('foo', 'type');
      transactionSuccess.setOutcome(constants.OUTCOME_SUCCESS);
      transactionSuccess._setOutcomeFromHttpStatusCode(500);
      agent.endTransaction();
      t.equals(
        transactionSuccess.outcome,
        constants.OUTCOME_SUCCESS,
        'agent uses setOutcome status',
      );

      const transactionFailure = agent.startTransaction('foo', 'type');
      transactionFailure.setOutcome(constants.OUTCOME_FAILURE);
      transactionFailure._setOutcomeFromHttpStatusCode(200);
      agent.endTransaction();
      t.equals(
        transactionFailure.outcome,
        constants.OUTCOME_FAILURE,
        'agent uses setOutcome status',
      );

      const transactionUnknown = agent.startTransaction('foo', 'type');
      transactionUnknown.setOutcome(constants.OUTCOME_UNKNOWN);
      transactionUnknown._setOutcomeFromHttpStatusCode(200);
      agent.endTransaction();
      t.equals(
        transactionUnknown.outcome,
        constants.OUTCOME_UNKNOWN,
        'agent uses setOutcome status',
      );

      test.test('outcome not set after transaction ends', function (t) {
        const transaction = agent.startTransaction('foo', 'type');
        transaction._setOutcomeFromHttpStatusCode(200);
        agent.endTransaction();
        t.equals(transaction.outcome, constants.OUTCOME_SUCCESS, 'success');
        transaction.setOutcome(constants.OUTCOME_FAILURE);
        t.equals(
          transaction.outcome,
          constants.OUTCOME_SUCCESS,
          'still success',
        );
        t.end();
      });

      t.end();
    },
  );
  test.end();
});

suite('agent level setTransactionOutcome tests', function (test) {
  test.test('outcome set', function (t) {
    const transaction = agent.startTransaction('foo', 'type');
    agent.setTransactionOutcome(constants.OUTCOME_SUCCESS);
    agent.endTransaction();
    t.equals(
      transaction.outcome,
      constants.OUTCOME_SUCCESS,
      'outcome set to success',
    );
    t.end();
  });
  test.end();
});

suite('agent level setSpanOutcome tests', function (test) {
  test.test('outcome set', function (t) {
    const transaction = agent.startTransaction('t0', 'type');
    const span = transaction.startSpan('s1');
    const childSpan = transaction.startSpan('s2');

    // This should only impact the current span (s2).
    agent.setSpanOutcome(constants.OUTCOME_FAILURE);

    childSpan.end();
    span.end();
    agent.endTransaction();
    t.equals(
      childSpan.outcome,
      constants.OUTCOME_FAILURE,
      'outcome of s2 set to failure',
    );
    t.equals(
      span.outcome,
      constants.OUTCOME_SUCCESS,
      'outcome of s1 set to success, not affected by agent.setSpanOutcome call',
    );
    t.end();
  });
  test.end();
});
