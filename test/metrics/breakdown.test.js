/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const Agent = require('../../lib/agent');
const { CapturingTransport } = require('../_capturing_transport');

const basicMetrics = [
  'system.cpu.total.norm.pct',
  'system.memory.total',
  'system.memory.actual.free',
  'system.process.cpu.total.norm.pct',
  'system.process.cpu.system.norm.pct',
  'system.process.cpu.user.norm.pct',
  'system.process.memory.rss.bytes',
  'nodejs.handles.active',
  'nodejs.requests.active',
  'nodejs.memory.heap.allocated.bytes',
  'nodejs.memory.heap.used.bytes',
  'nodejs.eventloop.delay.avg.ms',
];

if (process.platform === 'linux') {
  basicMetrics.push('system.process.memory.size');
}

const spanMetrics = ['span.self_time.count', 'span.self_time.sum.us'];

const metricKeysFromName = {
  'transaction span': spanMetrics,
  span: spanMetrics,
};

function nullableEqual(a, b) {
  return (!a && !b) || a === b;
}

const finders = {
  'transaction span'(metricsets) {
    return metricsets.find(
      (metricset) => metricset.span && metricset.span.type === 'app',
    );
  },
  span(metricsets, span) {
    return metricsets.find((metricset) => {
      if (!metricset.span) return false;
      const { type, subtype } = metricset.span;
      if (!nullableEqual(type, span.type)) return false;
      if (!nullableEqual(subtype, span.subtype)) return false;
      return true;
    });
  },
};

const expectations = {
  transaction(transaction) {
    return {
      transaction: {
        name: transaction.name,
        type: transaction.type,
      },
    };
  },
  'transaction span'(transaction) {
    return Object.assign(this.transaction(transaction), {
      span: {
        type: 'app',
      },
    });
  },
  span(transaction, span) {
    return Object.assign(this.transaction(transaction), {
      span: {
        type: span.type,
      },
    });
  },
};

// Use 1s, the shortest enabled metrics interval allowed, so tests waiting for
// metrics to be reported need only wait this long. The agent has no mechanism
// to "flush/send metrics now".
const testMetricsInterval = '1s';
const testMetricsIntervalMs = 1000;
const testAgentOpts = {
  serviceName: 'test-breakdown-metrics',
  cloudProvider: 'none',
  centralConfig: false,
  captureExceptions: false,
  // Create a transport that captures all sent events for later asserts.
  transport() {
    return new CapturingTransport();
  },
  metricsInterval: testMetricsInterval,
};

// Call `waitCb()` callback after breakdown metrics have been sent by the given
// agent. Or call `waitCb(err)` after `2 * testMetricsIntervalMs` to indicate
// a timeout.
//
// A test of breakdown metrics involves:
// 1. creating some transactions and spans with particular start/end times, then
// 2. testing the metricsets sent to the agent's transport.
//
// The issue is that the agent currently does not provide a mechanism to know
// *when* all breakdown metrics (which are N separate metricsets) for ended
// transactions and spans have been sent. In a test case that creates and ends
// all transactions and spans synchronously, it is possible that breakdown
// metrics will come in the initial send of metricsets (which is async, but
// soon). For other cases we know they will be sent soon after the next
// metricsInterval (set to 1s in this test file). However, both the *start* of
// that `setInterval` and the collection of metrics before calling
// `transport.sendMetricSet()` are asynchronous.
function waitForAgentToSendBreakdownMetrics(agent, waitCb) {
  const timeoutMs = 2 * testMetricsIntervalMs;
  const timeout = setTimeout(function () {
    waitCb(
      new Error(
        `timeout: breakdown metrics were not sent within ${timeoutMs}ms`,
      ),
    );
  }, timeoutMs);

  // Wrap `transport.sendMetricSet` to watch for sent metrics.
  //
  // The complete set of "breakdown metrics" is N metricsets with
  // `metricset.transaction` sent at nearly the same time. That "nearly" is
  // async with no strong guarantee. We could either have each test case pass
  // in the expected number of metricsets, or use a short timeout to cover that
  // "nearly the same time" gap. I prefer the latter, because it avoids the
  // problem of a test expecting 2 metricsets and never noticing that 3 are
  // actually sent.
  const WAIT_FOR_FULL_BREAKDOWN_METRICSETS_GROUP_MS = 100;
  const origSendMetricSet = agent._apmClient.sendMetricSet;
  agent._apmClient.sendMetricSet = function watchingSendMetricSet(
    metricset,
    cb,
  ) {
    if (metricset.transaction) {
      // This is the first breakdown metric. Wait a short while for all of them
      // in this "group" to be sent.
      clearTimeout(timeout);
      agent._apmClient.sendMetricSet = origSendMetricSet;
      setTimeout(waitCb, WAIT_FOR_FULL_BREAKDOWN_METRICSETS_GROUP_MS);
    }
    return origSendMetricSet.apply(this, arguments);
  };
}

test('includes breakdown when sampling', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar');
  var span = agent.startSpan('s0 name', 's0 type');
  if (span) span.end();
  transaction.end();

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const data = agent._apmClient;
      t.strictEqual(data.transactions.length, 1, 'has one transaction');
      assertTransaction(t, transaction, data.transactions[0]);

      t.strictEqual(data.spans.length, 1, 'has one span');
      assertSpan(t, span, data.spans[0]);

      const { metricsets } = data;
      assertMetricSet(t, 'span', metricsets, {
        transaction,
        span,
      });
      assertMetricSet(t, 'transaction span', metricsets, {
        transaction,
        span,
      });

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('only transaction', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 30 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with single sub-span', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span = agent.startSpan('SELECT *', 'db.mysql', { startTime: 10 });
  if (span) span.end(20);
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets, span),
        span: finders.span(metricsets, span),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with single app sub-span', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span = agent.startSpan('foo', 'app', { startTime: 10 });
  if (span) span.end(20);
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets, span),
        span: finders.span(metricsets, span),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 30 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with parallel sub-spans', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0;
  setImmediate(function () {
    span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 });
    setImmediate(function () {
      if (span0) span0.end(20);
    });
  });
  setImmediate(function () {
    // Note: This use of `childOf` is to ensure span1 is a child of the
    // transaction for the special case of (a) contextManager="patch" such that
    // we are using "patch-async.js" and (b) use of `agent.destroy(); new
    // Agent()`.  The latter breaks patch-async's patching of setImmediate.
    var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', {
      startTime: 10,
      childOf: transaction,
    });
    setImmediate(function () {
      if (span1) span1.end(20);
      transaction.end(null, 30);
    });
  });

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
        span: finders.span(metricsets, span0),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with overlapping sub-spans', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0;
  setImmediate(function () {
    span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 });
    setImmediate(function () {
      if (span0) span0.end(20);
    });
  });
  setImmediate(function () {
    // See "childOf" comment above for why `childOf` is used here.
    var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', {
      startTime: 15,
      childOf: transaction,
    });
    setImmediate(function () {
      if (span1) span1.end(25);
      setImmediate(function () {
        transaction.end(null, 30);
      });
    });
  });

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
        span: finders.span(metricsets, span0),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 15 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with sequential sub-spans', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 5 });
  if (span0) span0.end(15);
  var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 15 });
  if (span1) span1.end(25);
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
        span: finders.span(metricsets, span0),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with sub-spans returning to app time', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0 = agent.startSpan('SELECT * FROM a', 'db.mysql', { startTime: 10 });
  if (span0) span0.end(15);
  var span1 = agent.startSpan('SELECT * FROM b', 'db.mysql', { startTime: 20 });
  if (span1) span1.end(25);
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
        span: finders.span(metricsets, span0),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 20 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with overlapping nested async sub-spans', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0 = agent.startSpan('foo', 'app', { startTime: 10 });
  var span1 = agent.startSpan('SELECT *', 'db.mysql', {
    startTime: 15,
    childOf: span0,
  });
  if (span0) span0.end(20);
  if (span1) span1.end(25);
  transaction.end(null, 30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
        span: finders.span(metricsets, span1),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 2 },
          'span.self_time.sum.us': { value: 25 },
        },
        'sample values match',
      );

      t.ok(found.span, 'found db.mysql span metricset');
      t.deepEqual(
        found.span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with app sub-span extending beyond end', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span0 = agent.startSpan('foo', 'app', { startTime: 10 });
  transaction.end(null, 20);
  // span1 is *not* created, because cannot create a span on an ended transaction.
  var span1 = agent.startSpan('SELECT *', 'db.mysql', {
    startTime: 20,
    childOf: span0,
  });
  if (span0) span0.end(30);
  if (span1) span1.end(30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      t.notOk(
        finders.span(metricsets, { type: 'db.mysql' }),
        'does not have un-ended spans',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with other sub-span extending beyond end', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  var span = agent.startSpan('SELECT *', 'db.mysql', { startTime: 10 });
  transaction.end(null, 20);
  if (span) span.end(30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      t.notOk(
        finders.span(metricsets, { type: 'db.mysql' }),
        'does not have un-ended spans',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

test('with other sub-span starting after end', (t) => {
  const agent = new Agent().start(testAgentOpts);

  var transaction = agent.startTransaction('foo', 'bar', { startTime: 0 });
  transaction.end(null, 10);
  var span = agent.startSpan('SELECT *', 'db.mysql', {
    startTime: 20,
    childOf: transaction,
  });
  if (span) span.end(30);

  waitForAgentToSendBreakdownMetrics(
    agent,
    function (err) {
      t.error(err, 'wait for breakdown metrics did not timeout');
      const metricsets = agent._apmClient.metricsets;
      const found = {
        transaction_span: finders['transaction span'](metricsets),
      };

      t.ok(found.transaction_span, 'found app span metricset');
      t.deepEqual(
        found.transaction_span.samples,
        {
          'span.self_time.count': { value: 1 },
          'span.self_time.sum.us': { value: 10 },
        },
        'sample values match',
      );

      t.notOk(
        finders.span(metricsets, { type: 'db.mysql' }),
        'does not have un-ended spans',
      );

      agent.destroy();
      t.end();
    },
    testMetricsIntervalMs,
  );
});

function assertTransaction(t, expected, received) {
  t.comment('transaction');
  t.strictEqual(received.name, expected.name, 'type matches');
  t.strictEqual(received.type, expected.type, 'type matches');
  t.strictEqual(received.result, expected.result, 'result matches');
  t.strictEqual(received.sampled, expected.sampled, 'sampled state matches');
}

function assertSpan(t, expected, received) {
  t.comment('span');
  t.strictEqual(received.name, expected.name, 'name matches');
  t.strictEqual(received.type, expected.type, 'type matches');
}

function assertMetricSet(t, name, metricsets, { transaction, span } = {}) {
  const metricSet = finders[name](metricsets, span);
  const keys = metricKeysFromName[name];
  const expected = expectations[name](transaction, span);

  t.comment(`metricSet - ${name} metrics`);
  t.ok(metricSet, 'found metricset');
  assertMetricSetKeys(t, metricSet, keys);
  assertMetricSetData(t, metricSet, expected);
}

function assertMetricSetKeys(t, metricSet, keys) {
  t.deepEqual(
    Object.keys(metricSet.samples).sort(),
    keys.sort(),
    'has expected sample keys',
  );
}

function assertMetricSetData(t, metricSet, expected) {
  t.deepEqual(
    metricSet.transaction,
    expected.transaction,
    'has expected transaction data',
  );
  t.deepEqual(metricSet.span, expected.span, 'has expected span data');
}
