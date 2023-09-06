/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test agent behavior with Transaction sampling.

const tape = require('tape');

const Agent = require('../lib/agent');
const { MockAPMServer } = require('./_mock_apm_server');

const testAgentOpts = {
  serviceName: 'test-transaction-sampling',
  cloudProvider: 'none',
  centralConfig: false,
  captureExceptions: false,
  metricsInterval: '0s',
  logLevel: 'off',
};

// ---- tests

tape.test('various transactionSampleRate values', function (t) {
  function startNTransactions(rate, count) {
    const agent = new Agent().start(
      Object.assign({}, testAgentOpts, {
        disableSend: true,
        transactionSampleRate: rate,
      }),
    );

    var results = {
      count,
      numSampled: 0,
      numUnsampled: 0,
    };
    for (var i = 0; i < count; i++) {
      var trans = agent.startTransaction('myTrans');
      if (trans && trans.sampled) {
        results.numSampled++;
      } else {
        results.numUnsampled++;
      }
      trans.end();
    }

    agent.destroy();
    return results;
  }

  let results = startNTransactions(1.0, 1000);
  t.equal(
    results.numSampled,
    results.count,
    'with transactionSampleRate=1.0, all transactions were sampled',
  );
  t.equal(results.numUnsampled, 0);

  results = startNTransactions(0.1, 1000);
  t.ok(
    Math.abs(results.numSampled / results.count - 0.1) < 0.1, // within 10% of expected 10%
    'with transactionSampleRate=0.1, ~10% transactions were sampled: ' +
      JSON.stringify(results),
  );

  results = startNTransactions(0.5, 1000);
  t.ok(
    Math.abs(results.numSampled / results.count - 0.5) < 0.1, // within 10% of expected 50%
    'with transactionSampleRate=0.5, ~50% of transactions were sampled: ' +
      JSON.stringify(results),
  );

  t.end();
});

tape.test(
  'APM Server <v8.0 (which requires unsampled transactions)',
  function (suite) {
    let apmServer;
    let serverUrl;

    suite.test('setup mock APM server', function (t) {
      apmServer = new MockAPMServer({ apmServerVersion: '7.15.0' });
      apmServer.start(function (serverUrl_) {
        serverUrl = serverUrl_;
        t.comment('mock APM serverUrl: ' + serverUrl);
        t.end();
      });
    });

    suite.test('unsampled transactions do not include spans', function (t) {
      apmServer.clear();
      const agent = new Agent().start(
        Object.assign({}, testAgentOpts, {
          serverUrl,
          transactionSampleRate: 0,
        }),
      );

      // Start and end a transaction with some spans.
      var t0 = agent.startTransaction('t0');
      var s0 = agent.startSpan('s0', 'type');
      process.nextTick(function () {
        if (s0) s0.end();
        var s1 = agent.startSpan('s1', 'type');
        t.ok(
          s1 === null,
          'no span should be started for an unsampled transaction',
        );
        process.nextTick(function () {
          if (s1) s1.end();
          t0.end();

          agent.flush(function () {
            // Assert that the transaction was sent, but no spans.
            t.equal(apmServer.events.length, 2);
            var trans = apmServer.events[1].transaction;
            t.equal(trans.name, 't0');
            t.equal(trans.sampled, false, 'trans.sampled is false');
            t.equal(trans.sample_rate, 0, 'trans.sample_rate');
            t.equal(trans.context, undefined, 'no trans.context');

            agent.destroy();
            t.end();
          });
        });
      });
    });

    suite.test('teardown mock APM server', function (t) {
      apmServer.close();
      t.end();
    });

    suite.end();
  },
);

tape.test(
  'APM Server >=v8.0 (which does not want unsampled transactions)',
  function (suite) {
    let agent;
    let apmServer;
    let serverUrl;

    suite.test('setup mock APM server', function (t) {
      apmServer = new MockAPMServer({ apmServerVersion: '8.0.0' });
      apmServer.start(function (serverUrl_) {
        serverUrl = serverUrl_;
        t.comment('mock APM serverUrl: ' + serverUrl);
        t.end();
      });
    });

    suite.test(
      'setup agent and wait for APM Server version fetch',
      function (t) {
        agent = new Agent().start(
          Object.assign({}, testAgentOpts, {
            serverUrl,
            transactionSampleRate: 0,
          }),
        );

        // The agent's internal usage of client.supportsKeepingUnsampledTransaction()
        // is the behavior being tested. That depends on the APM client having time
        // to fetch the APM Server version before processing our test transaction.
        // There isn't a mechanism exposed to wait for this, so we just wait a short
        // while and poke into the internal APM client props.
        setTimeout(function () {
          t.ok(
            agent._apmClient._apmServerVersion,
            'the agent APM client has fetched the APM Server version',
          );
          t.end();
        }, 1000);
      },
    );

    suite.test('unsampled transactions are not sent', function (t) {
      // Start and end a transaction with some spans.
      var t0 = agent.startTransaction('t0');
      var s0 = agent.startSpan('s0', 'type');
      process.nextTick(function () {
        if (s0) s0.end();
        var s1 = agent.startSpan('s1', 'type');
        t.ok(
          s1 === null,
          'no span should be started for an unsampled transaction',
        );
        process.nextTick(function () {
          if (s1) s1.end();
          t0.end();

          agent.flush(function () {
            t.equal(
              apmServer.events.length,
              0,
              'no events were set to APM Server',
            );
            t.end();
          });
        });
      });
    });

    suite.test('teardown mock APM server', function (t) {
      agent.destroy();
      apmServer.close();
      t.end();
    });

    suite.end();
  },
);
