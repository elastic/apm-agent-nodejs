/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test functionality described in:
//  https://github.com/elastic/apm/blob/main/tests/agents/gherkin-specs/otel_bridge.feature#L30
// which largely tests compatibility mapping described here:
//  https://github.com/elastic/apm/blob/main/specs/agents/tracing-api-otel.md#compatibility-mapping
//
// It would be more convenient for maintenance to test "otel_bridge.feature"
// directly. However we cannot test Gherkin (.feature) files directly.
// See https://github.com/elastic/apm-agent-nodejs/pull/2672 for why.
//
// Instead, this file is a *manual* painstaking translation of the logic of
// "otel_bridge.feature".
// - Currently at commit 4412a55 of https://github.com/elastic/apm/commits/main/tests/agents/gherkin-specs/otel_bridge.feature
// - Each "Scenario: ..." from "otel_bridge.feature" is a separate test case below.

const otel = require('@opentelemetry/api');
const tape = require('tape');

const Agent = require('../../lib/agent');
const {
  OUTCOME_UNKNOWN,
  OUTCOME_SUCCESS,
  OUTCOME_FAILURE,
} = require('../../lib/constants');
const { MockAPMServer } = require('../_mock_apm_server');

tape.test('otel_bridge.feature scenarios', function (suite) {
  let apmServer;
  let serverUrl;
  let agent;
  let tracer;

  suite.test('setup', function (t) {
    apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl_) {
      serverUrl = serverUrl_;
      t.comment('mock APM serverUrl: ' + serverUrl);
      agent = new Agent().start({
        serviceName: 'test-otel_bridge-feature',
        serverUrl,
        opentelemetryBridgeEnabled: true,
        // The following options to silence some unneed features from the agent.
        cloudProvider: 'none',
        centralConfig: false,
        captureExceptions: false,
        metricsInterval: '0s',
        logLevel: 'off',
      });
      tracer = otel.trace.getTracer();
      t.end();
    });
  });

  // Scenario: Create transaction from OTel span with remote context
  // -> Handled in "nonrecordingspan-parent.js".

  // Scenario: Create root transaction from OTel span without parent
  // -> Handled in "start-span.js".

  // Scenario: Create span from OTel span
  // -> Handled in "start-active-span.js".

  suite.test(
    'Scenario Outline: OTel span kind <kind> for spans & default span type & subtype',
    function (t) {
      const examples = [
        { kind: otel.SpanKind.INTERNAL, type: 'app', subtype: 'internal' },
        { kind: otel.SpanKind.SERVER, type: 'unknown', subtype: null },
        { kind: otel.SpanKind.CLIENT, type: 'unknown', subtype: null },
        { kind: otel.SpanKind.PRODUCER, type: 'unknown', subtype: null },
        { kind: otel.SpanKind.CONSUMER, type: 'unknown', subtype: null },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer.startSpan(`s${idx}`, { kind: ex.kind }).end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.comment(`example: ${JSON.stringify(ex)}`);
          t.ok(span, 'Then Elastic bridged object is a span');
          t.equal(
            span.otel.span_kind,
            otel.SpanKind[ex.kind],
            'Then Elastic bridged span OTel kind is "<kind>"',
          );
          t.equal(
            span.type,
            ex.type,
            'Then Elastic bridged span type is "<default_type>"',
          );
          t.equal(
            span.subtype,
            ex.subtype,
            'Then Elastic bridged span subtype is "<default_subtype>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline: OTel span kind <kind> for transactions & default transaction type',
    function (t) {
      const examples = [
        { kind: otel.SpanKind.INTERNAL },
        { kind: otel.SpanKind.SERVER },
        { kind: otel.SpanKind.CLIENT },
        { kind: otel.SpanKind.PRODUCER },
        { kind: otel.SpanKind.CONSUMER },
      ];
      examples.forEach((ex, idx) => {
        tracer.startSpan(`s${idx}`, { kind: ex.kind }).end();
      });

      agent.flush(function () {
        const transactions = apmServer.events
          .filter((e) => e.transaction)
          .map((e) => e.transaction)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(
          transactions.length,
          examples.length,
          `got ${examples.length} transactions`,
        );
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const trans = transactions[i];
          t.ok(trans, 'Then Elastic bridged object is a transaction');
          t.equal(
            trans.otel.span_kind,
            otel.SpanKind[ex.kind],
            'Then Elastic bridged transaction OTel kind is "<kind>"',
          );
          t.equal(
            trans.type,
            'unknown',
            'Then Elastic bridged transaction type is "unknown"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline:  OTel span mapping with status <status> for transactions',
    function (t) {
      const examples = [
        { status: otel.SpanStatusCode.UNSET, outcome: OUTCOME_UNKNOWN },
        { status: otel.SpanStatusCode.OK, outcome: OUTCOME_SUCCESS },
        { status: otel.SpanStatusCode.ERROR, outcome: OUTCOME_FAILURE },
      ];
      examples.forEach((ex, idx) => {
        tracer.startSpan(`s${idx}`).setStatus(ex.status).end();
      });

      agent.flush(function () {
        const transactions = apmServer.events
          .filter((e) => e.transaction)
          .map((e) => e.transaction)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(
          transactions.length,
          examples.length,
          `got ${examples.length} transactions`,
        );
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const trans = transactions[i];
          t.ok(trans, 'Then Elastic bridged object is a transaction');
          t.equal(
            trans.outcome,
            ex.outcome,
            'Then Elastic bridged transaction outcome is "<outcome>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline:  OTel span mapping with status <status> for spans',
    function (t) {
      const examples = [
        { status: otel.SpanStatusCode.UNSET, outcome: OUTCOME_UNKNOWN },
        { status: otel.SpanStatusCode.OK, outcome: OUTCOME_SUCCESS },
        { status: otel.SpanStatusCode.ERROR, outcome: OUTCOME_FAILURE },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer.startSpan(`s${idx}`).setStatus(ex.status).end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.ok(span, 'Then Elastic bridged object is a span');
          t.equal(
            span.outcome,
            ex.outcome,
            'Then Elastic bridged span outcome is "<outcome>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline: HTTP server [ <http.url> <http.scheme> ]',
    function (t) {
      const examples = [
        { attributes: { 'http.url': 'http://testing.invalid/' } },
        { attributes: { 'http.scheme': 'http' } },
      ];
      examples.forEach((ex, idx) => {
        tracer
          .startSpan(`s${idx}`, {
            kind: otel.SpanKind.SERVER,
            attributes: ex.attributes,
          })
          .end();
      });

      agent.flush(function () {
        const transactions = apmServer.events
          .filter((e) => e.transaction)
          .map((e) => e.transaction)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(
          transactions.length,
          examples.length,
          `got ${examples.length} transactions`,
        );
        for (let i = 0; i < examples.length; i++) {
          const trans = transactions[i];
          t.ok(trans, 'Then Elastic bridged object is a transaction');
          t.equal(
            trans.type,
            'request',
            'Then Elastic bridged transaction type is "request"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  // https://github.com/elastic/apm/blob/fc0a725/tests/agents/gherkin-specs/otel_bridge.feature#L111-L139
  suite.test(
    'Scenario Outline: HTTP client [ <http.url> <http.scheme> <http.host> <net.peer.ip> <net.peer.name> <net.peer.port> ]',
    function (t) {
      const examples = [
        {
          attributes: { 'http.url': 'https://testing.invalid:8443/' },
          target_service_name: 'testing.invalid:8443',
        },
        {
          attributes: { 'http.url': 'https://[::1]/' },
          target_service_name: '[::1]:443',
        },
        {
          attributes: { 'http.url': 'http://testing.invalid/' },
          target_service_name: 'testing.invalid:80',
        },
        {
          attributes: { 'http.scheme': 'http', 'http.host': 'testing.invalid' },
          target_service_name: 'testing.invalid:80',
        },
        {
          attributes: {
            'http.scheme': 'https',
            'http.host': 'testing.invalid',
            'net.peer.ip': '127.0.0.1',
          },
          target_service_name: 'testing.invalid:443',
        },
        {
          attributes: {
            'http.scheme': 'http',
            'net.peer.ip': '127.0.0.1',
            'net.peer.port': '81',
          },
          target_service_name: '127.0.0.1:81',
        },
        {
          attributes: {
            'http.scheme': 'https',
            'net.peer.ip': '127.0.0.1',
            'net.peer.port': '445',
          },
          target_service_name: '127.0.0.1:445',
        },
        {
          attributes: {
            'http.scheme': 'http',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'host1',
            'net.peer.port': '445',
          },
          target_service_name: 'host1:445',
        },
        {
          attributes: {
            'http.scheme': 'https',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'host2',
            'net.peer.port': '445',
          },
          target_service_name: 'host2:445',
        },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer
            .startSpan(`s${idx}`, {
              kind: otel.SpanKind.CLIENT,
              attributes: ex.attributes,
            })
            .end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.equal(
            span.type,
            'external',
            'Then Elastic bridged span type is "external"',
          );
          t.equal(
            span.subtype,
            'http',
            'Then Elastic bridged span subtype is "http"',
          );
          t.deepEqual(
            span.otel.attributes,
            ex.attributes,
            'Then Elastic bridged span OTel attributes are copied as-is',
          );
          t.equal(
            span.context.destination.service.resource,
            ex.target_service_name,
            'Then Elastic bridged span destination resource is set to "<target_service_name>"',
          );
          t.equal(
            span.context.service.target.type,
            'http',
            "Then Elastic bridged span service target type is 'http' ...",
          );
          t.equal(
            span.context.service.target.name,
            ex.target_service_name,
            'Then Elastic bridged span service target ... name is "<target_service_name>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline: DB client [ <db.system> <net.peer.ip> <net.peer.name> <net.peer.port>]',
    function (t) {
      const examples = [
        {
          attributes: { 'db.system': 'mysql' },
          resource: 'mysql',
        },
        {
          attributes: { 'db.system': 'oracle', 'net.peer.name': 'oracledb' },
          resource: 'oracle',
        },
        {
          attributes: { 'db.system': 'oracle', 'net.peer.ip': '127.0.0.1' },
          resource: 'oracle',
        },
        {
          attributes: {
            'db.system': 'mysql',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'dbserver',
            'net.peer.port': '3307',
          },
          resource: 'mysql',
        },
        {
          attributes: { 'db.system': 'mysql', 'db.name': 'myDb' },
          resource: 'mysql/myDb',
          target_service_name: 'myDb',
        },
        {
          attributes: {
            'db.system': 'oracle',
            'db.name': 'myDb',
            'net.peer.name': 'oracledb',
          },
          resource: 'oracle/myDb',
          target_service_name: 'myDb',
        },
        {
          attributes: {
            'db.system': 'oracle',
            'db.name': 'myDb',
            'net.peer.ip': '127.0.0.1',
          },
          resource: 'oracle/myDb',
          target_service_name: 'myDb',
        },
        {
          attributes: {
            'db.system': 'mysql',
            'db.name': 'myDb',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'dbserver',
            'net.peer.port': '3307',
          },
          resource: 'mysql/myDb',
          target_service_name: 'myDb',
        },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer
            .startSpan(`s${idx}`, {
              kind: otel.SpanKind.CLIENT,
              attributes: ex.attributes,
            })
            .end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.equal(span.type, 'db', 'Then Elastic bridged span type is "db"');
          t.equal(
            span.subtype,
            ex.attributes['db.system'],
            'Then Elastic bridged span subtype is "<db.system>"',
          );
          t.deepEqual(
            span.otel.attributes,
            ex.attributes,
            'Then Elastic bridged span OTel attributes are copied as-is',
          );
          t.equal(
            span.context.destination.service.resource,
            ex.resource,
            'Then Elastic bridged span destination resource is set to "<resource>"',
          );
          t.equal(
            span.context.service.target.type,
            ex.attributes['db.system'],
            'Then Elastic bridged span service target type is "<db.system>" ...',
          );
          t.equal(
            span.context.service.target.name,
            ex.target_service_name,
            'Then Elastic bridged span service target ... name is "<target_service_name>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  // Scenario: Messaging consumer
  suite.test('Scenario: Messaging consumer', function (t) {
    tracer
      .startSpan('aSpan', {
        kind: otel.SpanKind.CONSUMER,
        attributes: { 'messaging.system': 'anything' },
      })
      .end();

    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      const trans = apmServer.events[1].transaction;
      t.equal(
        trans.type,
        'messaging',
        'Then Elastic bridged transaction type is "messaging"',
      );

      apmServer.clear();
      t.end();
    });
  });

  suite.test(
    'Scenario Outline: Messaging producer [ <messaging.system> <messaging.destination> <messaging.url> <net.peer.ip> <net.peer.name> <net.peer.port>]',
    function (t) {
      const examples = [
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.url': 'amqp://carrot:4444/q1',
          },
          resource: 'rabbitmq',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'carrot-server',
            'net.peer.port': '7777',
          },
          resource: 'rabbitmq',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'net.peer.name': 'carrot-server',
          },
          resource: 'rabbitmq',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'net.peer.ip': '127.0.0.1',
          },
          resource: 'rabbitmq',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': 'myQueue',
            'messaging.url': 'amqp://carrot:4444/q1 ',
          },
          resource: 'rabbitmq/myQueue',
          target_service_name: 'myQueue',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': 'myQueue',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'carrot-server',
            'net.peer.port': '7777',
          },
          resource: 'rabbitmq/myQueue',
          target_service_name: 'myQueue',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': 'myQueue',
            'net.peer.name': 'carrot-server',
          },
          resource: 'rabbitmq/myQueue',
          target_service_name: 'myQueue',
        },
        {
          attributes: {
            'messaging.system': 'rabbitmq',
            'messaging.destination': 'myQueue',
            'net.peer.ip': '127.0.0.1',
          },
          resource: 'rabbitmq/myQueue',
          target_service_name: 'myQueue',
        },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer
            .startSpan(`s${idx}`, {
              kind: otel.SpanKind.PRODUCER,
              attributes: ex.attributes,
            })
            .end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.equal(
            span.type,
            'messaging',
            'Then Elastic bridged span type is "messaging"',
          );
          t.equal(
            span.subtype,
            ex.attributes['messaging.system'],
            'Then Elastic bridged span subtype is "<messaging.system>"',
          );
          t.deepEqual(
            span.otel.attributes,
            ex.attributes,
            'Then Elastic bridged span OTel attributes are copied as-is',
          );
          t.equal(
            span.context.destination.service.resource,
            ex.resource,
            'Then Elastic bridged span destination resource is set to "<resource>"',
          );
          t.equal(
            span.context.service.target.type,
            ex.attributes['messaging.system'],
            'Then Elastic bridged span service target type is "<messaging.system>" ...',
          );
          t.equal(
            span.context.service.target.name,
            ex.target_service_name,
            'Then Elastic bridged span service target ... name is "<target_service_name>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  suite.test(
    'Scenario Outline: RPC client [ <rpc.system>  <rpc.service> <net.peer.ip> <net.peer.name> <net.peer.port>]',
    function (t) {
      const examples = [
        {
          attributes: {
            'rpc.system': 'grpc',
          },
          resource: 'grpc',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'rpc.service': 'myService',
          },
          resource: 'myService',
          target_service_name: 'myService',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'rpc.service': 'myService',
            'net.peer.name': 'rpc-server',
          },
          resource: 'rpc-server',
          target_service_name: 'rpc-server',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'rpc.service': 'myService',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'rpc-server',
          },
          resource: 'rpc-server',
          target_service_name: 'rpc-server',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'rpc-server',
            'net.peer.port': '7777',
          },
          resource: 'rpc-server:7777',
          target_service_name: 'rpc-server:7777',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'rpc.service': 'myService',
            'net.peer.ip': '127.0.0.1',
            'net.peer.name': 'rpc-server',
            'net.peer.port': '7777',
          },
          resource: 'rpc-server:7777',
          target_service_name: 'rpc-server:7777',
        },
        {
          attributes: {
            'rpc.system': 'grpc',
            'rpc.service': 'myService',
            'net.peer.ip': '127.0.0.1',
            'net.peer.port': '7777',
          },
          resource: '127.0.0.1:7777',
          target_service_name: '127.0.0.1:7777',
        },
      ];
      tracer.startActiveSpan('aTrans', (aTrans) => {
        examples.forEach((ex, idx) => {
          tracer
            .startSpan(`s${idx}`, {
              kind: otel.SpanKind.CLIENT,
              attributes: ex.attributes,
            })
            .end();
        });
        aTrans.end();
      });

      agent.flush(function () {
        const spans = apmServer.events
          .filter((e) => e.span)
          .map((e) => e.span)
          .sort((a, b) => (a.name < b.name ? -1 : 1)); // Cannot use "timestamp" for sorting, because #2180.
        t.equal(spans.length, examples.length, `got ${examples.length} spans`);
        for (let i = 0; i < examples.length; i++) {
          const ex = examples[i];
          const span = spans[i];
          t.comment('attributes: ' + JSON.stringify(ex.attributes));
          t.equal(
            span.type,
            'external',
            'Then Elastic bridged span type is "external"',
          );
          t.equal(
            span.subtype,
            ex.attributes['rpc.system'],
            'Then Elastic bridged span subtype is "<rpc.system>"',
          );
          t.deepEqual(
            span.otel.attributes,
            ex.attributes,
            'Then Elastic bridged span OTel attributes are copied as-is',
          );
          t.equal(
            span.context.destination.service.resource,
            ex.resource,
            'Then Elastic bridged span destination resource is set to "<resource>"',
          );
        }

        apmServer.clear();
        t.end();
      });
    },
  );

  // Scenario: RPC server
  suite.test('Scenario: RPC server', function (t) {
    tracer
      .startSpan('aSpan', {
        kind: otel.SpanKind.SERVER,
        attributes: { 'rpc.system': 'grpc' },
      })
      .end();

    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      const trans = apmServer.events[1].transaction;
      t.equal(
        trans.type,
        'request',
        'Then Elastic bridged transaction type is "request"',
      );

      apmServer.clear();
      t.end();
    });
  });

  suite.test('teardown', function (t) {
    agent.destroy();
    apmServer.close();
    t.end();
  });

  suite.end();
});
