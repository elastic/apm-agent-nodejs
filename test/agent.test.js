/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the public Agent API.
//
// This test file does not rely on automatic instrumentation of modules, so
// we do not need to start the agent at the top of file. Instead, tests create
// separate instances of the Agent.

var http = require('http');
var path = require('path');
var os = require('os');

var test = require('tape');

const Agent = require('../lib/agent');
const {
  CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS,
  CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  CAPTURE_ERROR_LOG_STACK_TRACES_NEVER,
  DEFAULTS,
} = require('../lib/config/schema');
const { findObjInArray } = require('./_utils');
const { MockAPMServer } = require('./_mock_apm_server');
const { NoopApmClient } = require('../lib/apm-client/noop-apm-client');
var packageJson = require('../package.json');

// Options to pass to `agent.start()` to turn off some default agent behavior
// that is unhelpful for these tests.
const agentOpts = {
  serviceName: 'test-agent',
  centralConfig: false,
  captureExceptions: false,
  metricsInterval: '0s',
  cloudProvider: 'none',
  spanStackTraceMinDuration: 0, // Always have span stacktraces.
  logLevel: 'warn',
  // Ensure the APM client's `GET /` requests do not get in the way of test
  // asserts. Also ensure it is new enough to include 'activation_method'.
  apmServerVersion: '8.7.1',
};
const agentOptsNoopTransport = Object.assign({}, agentOpts, {
  transport: function createNoopTransport() {
    // Avoid accidentally trying to send data to an APM server.
    return new NoopApmClient();
  },
});

// ---- internal support functions

function assertMetadata(t, payload) {
  t.strictEqual(payload.service.name, 'test-agent', 'metadata: service.name');
  t.deepEqual(
    payload.service.runtime,
    { name: 'node', version: process.versions.node },
    'metadata: service.runtime',
  );
  t.deepEqual(
    payload.service.agent,
    {
      name: 'nodejs',
      version: packageJson.version,
      activation_method: 'require',
    },
    'metadata: service.agent',
  );

  const system = Object.assign({}, payload.system);
  t.ok(
    system.detected_hostname.startsWith(os.hostname().toLowerCase()),
    'metadata: system.detected_hostname',
  );
  delete system.detected_hostname;
  t.strictEqual(
    system.architecture,
    process.arch,
    'metadata: system.architecture',
  );
  delete system.architecture;
  t.strictEqual(system.platform, process.platform, 'metadata: system.platform');
  delete system.platform;
  if (system.container) {
    t.deepEqual(
      Object.keys(system.container),
      ['id'],
      'metadata: system.container',
    );
    t.strictEqual(
      typeof system.container.id,
      'string',
      'metadata: system.container.id is a string',
    );
    t.ok(
      /^[\da-f]{64}$/.test(system.container.id),
      'metadata: system.container.id',
    );
    delete system.container;
  }
  t.equal(
    Object.keys(system).length,
    0,
    'metadata: system, no unexpected keys: ' + JSON.stringify(system),
  );

  t.ok(payload.process, 'metadata: process');
  t.strictEqual(payload.process.pid, process.pid, 'metadata: process.pid');
  t.ok(payload.process.pid > 0, 'metadata: process.pid > 0');
  t.ok(payload.process.title, 'metadata: has a process.title');
  t.strictEqual(
    payload.process.title,
    process.title,
    'metadata: process.title matches',
  );
  t.deepEqual(payload.process.argv, process.argv, 'metadata: has process.argv');
  t.ok(
    payload.process.argv.length >= 2,
    'metadata: process.argv has at least two args',
  );
}

function assertStackTrace(t, stacktrace) {
  t.ok(stacktrace !== undefined, 'should have a stack trace');
  t.ok(Array.isArray(stacktrace), 'stack trace should be an array');
  t.ok(stacktrace.length > 0, 'stack trace should have at least one frame');
  t.strictEqual(stacktrace[0].filename, path.join('test', 'agent.test.js'));
}

function deep(depth, n) {
  if (!n) n = 0;
  if (n < depth) return deep(depth, ++n);
  return new Error();
}

// ---- tests

test('#getServiceName()', function (t) {
  const agent = new Agent();

  // Before agent.start() the agent hasn't configured yet.
  t.ok(!agent.isStarted(), 'agent should not have been started yet');
  t.strictEqual(agent.getServiceName(), undefined);

  agent.start(
    Object.assign({}, agentOptsNoopTransport, { serviceName: 'myServiceName' }),
  );
  t.strictEqual(agent.getServiceName(), 'myServiceName');
  t.strictEqual(agent.getServiceName(), agent._conf.serviceName);

  agent.destroy();
  t.end();
});

test('#setFramework()', function (t) {
  // Use `agentOpts` instead of `agentOptsNoopTransport` because this test is
  // reaching into `agent._apmClient` internals.
  const agent = new Agent().start(agentOpts);

  t.strictEqual(agent._conf.frameworkName, undefined);
  t.strictEqual(agent._conf.frameworkVersion, undefined);
  t.strictEqual(agent._apmClient._conf.frameworkName, undefined);
  t.strictEqual(agent._apmClient._conf.frameworkVersion, undefined);
  agent.setFramework({});
  t.strictEqual(agent._conf.frameworkName, undefined);
  t.strictEqual(agent._conf.frameworkVersion, undefined);
  t.strictEqual(agent._apmClient._conf.frameworkName, undefined);
  t.strictEqual(agent._apmClient._conf.frameworkVersion, undefined);
  agent.setFramework({ name: 'foo' });
  t.strictEqual(agent._conf.frameworkName, 'foo');
  t.strictEqual(agent._conf.frameworkVersion, undefined);
  t.strictEqual(agent._apmClient._conf.frameworkName, 'foo');
  t.strictEqual(agent._apmClient._conf.frameworkVersion, undefined);
  agent.setFramework({ version: 'bar' });
  t.strictEqual(agent._conf.frameworkName, 'foo');
  t.strictEqual(agent._conf.frameworkVersion, 'bar');
  t.strictEqual(agent._apmClient._conf.frameworkName, 'foo');
  t.strictEqual(agent._apmClient._conf.frameworkVersion, 'bar');
  agent.setFramework({ name: 'a', version: 'b' });
  t.strictEqual(agent._conf.frameworkName, 'a');
  t.strictEqual(agent._conf.frameworkVersion, 'b');
  t.strictEqual(agent._apmClient._conf.frameworkName, 'a');
  t.strictEqual(agent._apmClient._conf.frameworkVersion, 'b');
  agent.setFramework({ name: 'foo', version: 'bar', overwrite: false });
  t.strictEqual(agent._conf.frameworkName, 'a');
  t.strictEqual(agent._conf.frameworkVersion, 'b');
  t.strictEqual(agent._apmClient._conf.frameworkName, 'a');
  t.strictEqual(agent._apmClient._conf.frameworkVersion, 'b');
  agent.destroy();
  t.end();
});

test('#startTransaction()', function (t) {
  t.test(
    'agent not yet started: startTransaction() should not crash',
    function (t) {
      const agent = new Agent(); // do not start the agent
      agent.startTransaction('foo');
      agent.destroy();
      t.end();
    },
  );

  t.test('name, type, subtype and action', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction('foo', 'type', 'subtype', 'action');
    t.strictEqual(trans.name, 'foo');
    t.strictEqual(trans.type, 'type');
    t.strictEqual(trans.subtype, 'subtype');
    t.strictEqual(trans.action, 'action');
    agent.destroy();
    t.end();
  });

  t.test('options.startTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var startTime = Date.now() - 1000;
    var trans = agent.startTransaction('foo', 'bar', { startTime });
    trans.end();
    var duration = trans.duration();
    t.ok(
      duration > 990,
      `duration should be circa more than 1s (was: ${duration})`,
    ); // we've seen 998.752 in the wild
    t.ok(
      duration < 1100,
      `duration should be less than 1.1s (was: ${duration})`,
    );
    agent.destroy();
    t.end();
  });

  t.test('options.childOf', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    var trans = agent.startTransaction('foo', 'bar', { childOf });
    t.strictEqual(trans._context.traceparent.version, '00');
    t.strictEqual(
      trans._context.traceparent.traceId,
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    t.notEqual(trans._context.traceparent.id, '00f067aa0ba902b7');
    t.strictEqual(trans._context.traceparent.parentId, '00f067aa0ba902b7');
    t.strictEqual(trans._context.traceparent.flags, '01');
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#endTransaction()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.endTransaction();
    agent.destroy();
    t.end();
  });

  t.test('with no result', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(trans.ended, false);
    agent.endTransaction();
    t.strictEqual(trans.ended, true);
    t.strictEqual(trans.result, 'success');
    agent.destroy();
    t.end();
  });

  t.test('with explicit result', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(trans.ended, false);
    agent.endTransaction('done');
    t.strictEqual(trans.ended, true);
    t.strictEqual(trans.result, 'done');
    agent.destroy();
    t.end();
  });

  t.test('with custom endTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var startTime = Date.now() - 1000;
    var endTime = startTime + 2000.123;
    var trans = agent.startTransaction('foo', 'bar', { startTime });
    agent.endTransaction('done', endTime);
    t.strictEqual(trans.duration(), 2000.123);
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#currentTransaction', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.notOk(agent.currentTransaction);
    agent.destroy();
    t.end();
  });

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.currentTransaction, trans);
    agent.endTransaction();
    agent.destroy();
    t.end();
  });
});

test('#currentSpan', function (t) {
  t.test('no active or binding span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.notOk(agent.currentSpan);
    agent.destroy();
    t.end();
  });

  t.test('with binding span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    var span = agent.startSpan();
    t.strictEqual(agent.currentSpan, span);
    span.end();
    trans.end();
    agent.destroy();
    t.end();
  });

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    var span = agent.startSpan();
    process.nextTick(() => {
      t.strictEqual(agent.currentSpan, span);
      span.end();
      trans.end();
      agent.destroy();
      t.end();
    });
  });

  t.end();
});

test('#currentTraceparent', function (t) {
  t.test('no active transaction or span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.notOk(agent.currentTraceparent);
    agent.destroy();
    t.end();
  });

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.currentTraceparent, trans.traceparent);
    agent.endTransaction();
    agent.destroy();
    t.end();
  });

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var span = agent.startSpan();
    t.strictEqual(agent.currentTraceparent, span.traceparent);
    span.end();
    agent.endTransaction();
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#currentTraceIds', function (t) {
  t.test('no active transaction or span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.deepLooseEqual(agent.currentTraceIds, {});
    t.strictEqual(agent.currentTraceIds.toString(), '');
    agent.destroy();
    t.end();
  });

  t.test('with active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.deepLooseEqual(agent.currentTraceIds, {
      'trace.id': trans.traceId,
      'transaction.id': trans.id,
    });
    t.strictEqual(
      agent.currentTraceIds.toString(),
      `trace.id=${trans.traceId} transaction.id=${trans.id}`,
    );
    agent.endTransaction();
    agent.destroy();
    t.end();
  });

  t.test('with active span', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var span = agent.startSpan();
    t.deepLooseEqual(agent.currentTraceIds, {
      'trace.id': span.traceId,
      'span.id': span.id,
    });
    t.strictEqual(
      agent.currentTraceIds.toString(),
      `trace.id=${span.traceId} span.id=${span.id}`,
    );
    span.end();
    agent.endTransaction();
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#setTransactionName', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.doesNotThrow(function () {
      agent.setTransactionName('foo');
    });
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    agent.setTransactionName('foo');
    t.strictEqual(trans.name, 'foo');
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#startSpan()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(agent.startSpan(), null);
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var span = agent.startSpan('span-name', 'type', 'subtype', 'action');
    t.ok(span, 'should return a span');
    t.strictEqual(span.name, 'span-name');
    t.strictEqual(span.type, 'type');
    t.strictEqual(span.subtype, 'subtype');
    t.strictEqual(span.action, 'action');
    agent.destroy();
    t.end();
  });

  t.test('startSpan with no name results in span.name="unnamed"', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var span = agent.startSpan();
    t.ok(span, 'should return a span');
    t.strictEqual(span.name, 'unnamed');
    t.strictEqual(span.type, 'custom');
    t.strictEqual(span.subtype, null);
    t.strictEqual(span.action, null);
    agent.destroy();
    t.end();
  });

  t.test('options.startTime', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var startTime = Date.now() - 1000;
    var span = agent.startSpan('span-with-startTime', null, { startTime });
    span.end();
    var duration = span.duration();
    t.ok(
      duration > 990,
      `duration should be circa more than 1s (was: ${duration})`,
    ); // we've seen 998.752 in the wild
    t.ok(
      duration < 1100,
      `duration should be less than 1.1s (was: ${duration})`,
    );
    agent.destroy();
    t.end();
  });

  t.test('options.childOf', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.startTransaction();
    var childOf = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    var span = agent.startSpan(null, null, { childOf });
    t.strictEqual(span._context.traceparent.version, '00');
    t.strictEqual(
      span._context.traceparent.traceId,
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    t.notEqual(span._context.traceparent.id, '00f067aa0ba902b7');
    t.strictEqual(span._context.traceparent.parentId, '00f067aa0ba902b7');
    t.strictEqual(span._context.traceparent.flags, '01');
    span.end();
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#setUserContext()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(agent.setUserContext({ foo: 1 }), false);
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.setUserContext({ foo: 1 }), true);
    t.deepEqual(trans._user, { foo: 1 });
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#setCustomContext()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(agent.setCustomContext({ foo: 1 }), false);
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.setCustomContext({ foo: 1 }), true);
    t.deepEqual(trans._custom, { foo: 1 });
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#setGlobalLabel()', function (suite) {
  let apmServer;
  let suiteAgentOpts;

  suite.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl);
      suiteAgentOpts = Object.assign({}, agentOpts, { serverUrl });
      t.end();
    });
  });

  suite.test('sets a global label', async function (t) {
    apmServer.clear();
    const agent = new Agent().start(suiteAgentOpts);
    agent.setGlobalLabel('goo', 1);
    t.deepEqual(
      agent._conf.globalLabels,
      Object.entries({ goo: 1 }),
      'agent._conf.globalLabels',
    );
    agent.startTransaction('manual');
    agent.endTransaction();
    await agent.flush();
    t.deepEqual(
      apmServer.events[0].metadata.labels,
      { goo: 1 },
      'APM server metadata.labels',
    );
    agent.destroy();
    t.end();
  });

  suite.test('extends the predefined global labels', async function (t) {
    apmServer.clear();
    const agentOptsWithGlobalLabels = Object.assign({}, suiteAgentOpts, {
      globalLabels: { some: true },
    });
    const agent = new Agent().start(agentOptsWithGlobalLabels);
    agent.setGlobalLabel('goo', 1);
    t.deepEqual(
      agent._conf.globalLabels,
      Object.entries({ some: true, goo: 1 }),
      'agent._conf.globalLabels',
    );
    agent.startTransaction('manual');
    agent.endTransaction();
    await agent.flush();
    t.deepEqual(
      apmServer.events[0].metadata.labels,
      { some: true, goo: 1 },
      'APM server metadata.labels',
    );
    agent.destroy();
    t.end();
  });

  suite.test('overrides an existing global label', async function (t) {
    apmServer.clear();
    const agentOptsWithGlobalLabels = Object.assign({}, suiteAgentOpts, {
      globalLabels: { some: true, goo: 0 },
    });
    const agent = new Agent().start(agentOptsWithGlobalLabels);
    agent.setGlobalLabel('goo', 1);
    t.deepEqual(
      agent._conf.globalLabels,
      Object.entries({ some: true, goo: 1 }),
      'agent._conf.globalLabels',
    );
    agent.startTransaction('manual');
    agent.endTransaction();
    await agent.flush();
    t.deepEqual(
      apmServer.events[0].metadata.labels,
      { some: true, goo: 1 },
      'APM server metadata.labels',
    );
    agent.destroy();
    t.end();
  });

  suite.test('setGlobalLabel() when agent inactive', function (t) {
    apmServer.clear();
    const agent = new Agent().start({ active: false });
    let err;
    try {
      agent.setGlobalLabel('goo', 1);
    } catch (error) {
      err = error;
    }
    t.error(err, 'Should not error when inactive');
    agent.destroy();
    t.end();
  });

  suite.test('teardown mock APM server', function (t) {
    apmServer.close();
    t.end();
  });

  suite.end();
});

test('#setLabel()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(agent.setLabel('foo', 1), false);
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.setLabel('foo', 1), true);
    t.deepEqual(trans._labels, { foo: '1' });
    agent.destroy();
    t.end();
  });

  t.test('active transaction without label stringification', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.setLabel('positive', 1, false), true);
    t.strictEqual(agent.setLabel('negative', -10, false), true);
    t.strictEqual(agent.setLabel('boolean-true', true, false), true);
    t.strictEqual(agent.setLabel('boolean-false', false, false), true);
    t.strictEqual(agent.setLabel('string', 'a custom label', false), true);
    t.deepEqual(trans._labels, {
      positive: 1,
      negative: -10,
      'boolean-true': true,
      'boolean-false': false,
      string: 'a custom label',
    });
    agent.destroy();
    t.end();
  });

  t.end();
});

test('#addLabels()', function (t) {
  t.test('no active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(agent.addLabels({ foo: 1 }), false);
    agent.destroy();
    t.end();
  });

  t.test('active transaction', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.addLabels({ foo: 1, bar: 2 }), true);
    t.strictEqual(agent.addLabels({ foo: 3 }), true);
    t.deepEqual(trans._labels, { foo: '3', bar: '2' });
    agent.destroy();
    t.end();
  });

  t.test('active transaction without label stringification', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);
    var trans = agent.startTransaction();
    t.strictEqual(agent.addLabels({ foo: 1, bar: true }, false), true);
    t.deepEqual(trans._labels, { foo: 1, bar: true });
    agent.destroy();
    t.end();
  });

  t.end();
});

test('filters', function (t) {
  let apmServer;
  let filterAgentOpts;

  t.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl);
      filterAgentOpts = Object.assign({}, agentOpts, { serverUrl });
      t.end();
    });
  });

  t.test('#addFilter() - error', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    // Test filters are run in the order specified...
    agent.addFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo');
      t.strictEqual(++obj.context.custom.order, 1);
      return obj;
    });
    // ... and that an invalid filter (not a function) is handled.
    agent.addFilter('invalid');
    agent.addFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo');
      t.strictEqual(++obj.context.custom.order, 2);
      return obj;
    });

    agent.captureError(
      new Error('foo'),
      { custom: { order: 0 } },
      function (err) {
        t.error(err, 'captureError should not fail');
        t.equal(apmServer.events.length, 2, 'got 2 events');
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
        assertMetadata(t, apmServer.events[0].metadata);
        const data = apmServer.events[1].error;
        t.ok(data, 'event 1 is an error');
        t.strictEqual(data.exception.message, 'foo');
        t.strictEqual(data.context.custom.order, 2);

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  t.test('#addFilter() - transaction', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name');
      t.strictEqual(++obj.context.custom.order, 1);
      return obj;
    });
    agent.addFilter('invalid');
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name');
      t.strictEqual(++obj.context.custom.order, 2);
      return obj;
    });

    agent.startTransaction('transaction-name');
    agent.setCustomContext({ order: 0 });
    agent.endTransaction();
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].transaction;
      t.ok(data, 'event 1 is a transaction');
      t.strictEqual(data.name, 'transaction-name');
      t.strictEqual(data.context.custom.order, 2);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('#addFilter() - span', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name');
      obj.order = 1;
      return obj;
    });
    agent.addFilter('invalid');
    agent.addFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name');
      t.strictEqual(++obj.order, 2);
      return obj;
    });

    agent.startTransaction();
    const span = agent.startSpan('span-name');
    span.end();
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].span;
      t.ok(data, 'event 1 is a span');
      t.strictEqual(data.name, 'span-name');
      t.strictEqual(data.order, 2);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('#addErrorFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addTransactionFilter(function () {
      t.fail('should not call transaction filter');
    });
    agent.addSpanFilter(function () {
      t.fail('should not call span filter');
    });
    agent.addErrorFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo');
      t.strictEqual(++obj.context.custom.order, 1);
      return obj;
    });
    agent.addErrorFilter('invalid');
    agent.addErrorFilter(function (obj) {
      t.strictEqual(obj.exception.message, 'foo');
      t.strictEqual(++obj.context.custom.order, 2);
      return obj;
    });

    agent.captureError(
      new Error('foo'),
      { custom: { order: 0 } },
      function (err) {
        t.error(err, 'captureError should not fail');
        t.equal(apmServer.events.length, 2, 'got 2 events');
        t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
        assertMetadata(t, apmServer.events[0].metadata);
        const data = apmServer.events[1].error;
        t.ok(data, 'event 1 is an error');
        t.strictEqual(data.exception.message, 'foo');
        t.strictEqual(data.context.custom.order, 2);

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  t.test('#addTransactionFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addErrorFilter(function () {
      t.fail('should not call error filter');
    });
    agent.addSpanFilter(function () {
      t.fail('should not call span filter');
    });
    agent.addTransactionFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name');
      t.strictEqual(++obj.context.custom.order, 1);
      return obj;
    });
    agent.addTransactionFilter('invalid');
    agent.addTransactionFilter(function (obj) {
      t.strictEqual(obj.name, 'transaction-name');
      t.strictEqual(++obj.context.custom.order, 2);
      return obj;
    });

    agent.startTransaction('transaction-name');
    agent.setCustomContext({ order: 0 });
    agent.endTransaction();
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].transaction;
      t.ok(data, 'event 1 is a transaction');
      t.strictEqual(data.name, 'transaction-name');
      t.strictEqual(data.context.custom.order, 2);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('#addSpanFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addErrorFilter(function () {
      t.fail('should not call error filter');
    });
    agent.addTransactionFilter(function () {
      t.fail('should not call transaction filter');
    });
    agent.addSpanFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name');
      obj.order = 1;
      return obj;
    });
    agent.addSpanFilter('invalid');
    agent.addSpanFilter(function (obj) {
      t.strictEqual(obj.name, 'span-name');
      t.strictEqual(++obj.order, 2);
      return obj;
    });

    agent.startTransaction();
    const span = agent.startSpan('span-name');
    span.end();
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      t.ok(apmServer.events[0].metadata, 'event 0 is metadata');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].span;
      t.ok(data, 'event 1 is a span');
      t.strictEqual(data.name, 'span-name');
      t.strictEqual(data.order, 2);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('#addMetadataFilter()', function (t) {
    const agent = new Agent().start(filterAgentOpts);
    agent.addErrorFilter(function () {
      t.fail('should not call error filter');
    });
    agent.addSpanFilter(function () {
      t.fail('should not call span filter');
    });
    agent.addMetadataFilter(function (obj) {
      t.strictEqual(obj.service.agent.name, 'nodejs');
      obj.order = 1;
      return obj;
    });
    agent.addMetadataFilter('invalid');
    agent.addMetadataFilter(function (obj) {
      t.strictEqual(obj.service.agent.name, 'nodejs');
      t.strictEqual(++obj.order, 2);
      return obj;
    });

    agent.startTransaction('transaction-name');
    agent.endTransaction();
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'got 2 events');
      const data = apmServer.events[0].metadata;
      t.ok(data, 'event 0 is metadata');
      assertMetadata(t, data);
      t.strictEqual(data.service.agent.name, 'nodejs');
      t.strictEqual(data.order, 2);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  const falsyValues = [undefined, null, false, 0, '', NaN];
  falsyValues.forEach((falsy) => {
    t.test(`#addFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false;
      const agent = new Agent().start(filterAgentOpts);
      agent.addFilter(function (obj) {
        calledFirstFilter = true;
        return falsy;
      });
      agent.addFilter(function () {
        t.fail('should not call 2nd filter');
      });
      agent.captureError(new Error('foo'), function () {
        t.ok(calledFirstFilter, 'called first filter');
        t.equal(
          apmServer.requests.length,
          0,
          'APM server did not receive a request',
        );
        apmServer.clear();
        agent.destroy();
        t.end();
      });
    });

    t.test(`#addErrorFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false;
      const agent = new Agent().start(filterAgentOpts);
      agent.addErrorFilter(function (obj) {
        calledFirstFilter = true;
        return falsy;
      });
      agent.addErrorFilter(function () {
        t.fail('should not call 2nd filter');
      });
      agent.captureError(new Error('foo'), function () {
        t.ok(calledFirstFilter, 'called first filter');
        t.equal(
          apmServer.requests.length,
          0,
          'APM server did not receive a request',
        );
        apmServer.clear();
        agent.destroy();
        t.end();
      });
    });

    t.test(
      `#addTransactionFilter() - abort with '${String(falsy)}'`,
      function (t) {
        let calledFirstFilter = false;
        const agent = new Agent().start(filterAgentOpts);
        agent.addTransactionFilter(function (obj) {
          calledFirstFilter = true;
          return falsy;
        });
        agent.addTransactionFilter(function () {
          t.fail('should not call 2nd filter');
        });
        agent.startTransaction('transaction-name');
        agent.endTransaction();
        agent.flush(function () {
          t.ok(calledFirstFilter, 'called first filter');
          t.equal(
            apmServer.requests.length,
            0,
            'APM server did not receive a request',
          );
          apmServer.clear();
          agent.destroy();
          t.end();
        });
      },
    );

    t.test(`#addSpanFilter() - abort with '${String(falsy)}'`, function (t) {
      let calledFirstFilter = false;
      const agent = new Agent().start(filterAgentOpts);
      agent.addSpanFilter(function (obj) {
        calledFirstFilter = true;
        return falsy;
      });
      agent.addSpanFilter(function () {
        t.fail('should not call 2nd filter');
      });
      agent.startTransaction();
      const span = agent.startSpan('span-name');
      span.end();
      agent.flush(function () {
        t.ok(calledFirstFilter, 'called first filter');
        t.equal(
          apmServer.requests.length,
          0,
          'APM server did not receive a request',
        );
        apmServer.clear();
        agent.destroy();
        t.end();
      });
    });
  });

  t.test('teardown mock APM server', function (t) {
    apmServer.close();
    t.end();
  });

  t.end();
});

test('#flush()', function (t) {
  t.test('flush, start not called', function (t) {
    t.plan(2);
    const agent = new Agent();
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback');
      t.pass("should call flush callback even if agent.start() wasn't called");
      agent.destroy();
      t.end();
    });
  });

  t.test('flush, start called, but agent inactive', function (t) {
    t.plan(2);
    const agent = new Agent().start({ active: false });
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback');
      t.pass('should call flush callback even if agent is inactive');
      agent.destroy();
      t.end();
    });
  });

  t.test('flush, agent started, but no data in the queue', function (t) {
    t.plan(2);
    const agent = new Agent().start(agentOptsNoopTransport);
    agent.flush(function (err) {
      t.error(err, 'no error passed to agent.flush callback');
      t.pass("should call flush callback even if there's nothing to flush");
      agent.destroy();
      t.end();
    });
  });

  t.test('flush with transaction in the queue', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );
      agent.startTransaction('foo');
      agent.endTransaction();
      agent.flush(function (err) {
        t.error(err, 'no error passed to agent.flush callback');
        t.equal(apmServer.events.length, 2, 'apmServer got 2 events');
        const trans = apmServer.events[1].transaction;
        t.ok(trans, 'event 1 is a transaction');
        t.equal(trans.name, 'foo', 'the transaction has the expected name');

        apmServer.close();
        agent.destroy();
        t.end();
      });
    });
  });

  t.test('flush with inflight spans', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );
      const t0 = agent.startTransaction('t0');
      for (var i = 0; i < 10; i++) {
        agent.startSpan('s').end();
      }
      t0.end();
      agent.flush(function (err) {
        t.error(err, 'no error passed to agent.flush callback');
        t.equal(apmServer.events.length, 12, 'apmServer got 12 events');
        t.equal(
          apmServer.events[1].transaction.name,
          't0',
          'event[1] is transaction t0',
        );
        for (var i = 2; i < 12; i++) {
          t.equal(apmServer.events[i].span.name, 's', `event[${i}] is span s`);
        }

        apmServer.close();
        agent.destroy();
        t.end();
      });
    });
  });

  t.test('flush with inflight error', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );
      const t0 = agent.startTransaction('t0');
      agent.captureError(new Error('boom'));
      t0.end();
      agent.flush(function (err) {
        t.error(err, 'no error passed to agent.flush callback');
        t.equal(apmServer.events.length, 3, 'apmServer got 3 events');
        t.equal(
          apmServer.events[1].transaction.name,
          't0',
          'event[1] is transaction t0',
        );
        t.equal(
          apmServer.events[2].error.exception.message,
          'boom',
          'event[2] is error "boom"',
        );

        apmServer.close();
        agent.destroy();
        t.end();
      });
    });
  });

  // This tests that flushing does the right thing when a second
  // `agent.flush(...)` is called when an earlier `agent.flush(...)` is still in
  // progress.
  //
  // The intended behavior when there are multiple flushes in progress is that
  // a flush callback is called *when the newly inflight events since the last
  // flush have been sent*. In other words, given:
  //   1. end span A
  //   2. first flush
  //   3. end span B
  //   4. second flush
  // we expect the "first flush" to callback after span A has been sent, and
  // the "second flush" to callback after span B has been sent. It is possible
  // that the second flush calls back before the first flush, if span A takes
  // a long time to encode and send.
  t.test('second flush while flushing inflight spans', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );

      let nDone = 2;
      const done = function () {
        nDone--;
        if (nDone <= 0) {
          apmServer.close();
          agent.destroy();
          t.end();
        }
      };

      const t0 = agent.startTransaction('t0');
      const s1 = agent.startSpan('s1');
      // Artificially slow down the Span#_encode for this span, so that it is
      // "in flight" for a long time -- long enough for the first `.flush()`
      // to be in progress when the second `.flush()` comes.
      const origS1Encode = s1._encode.bind(s1);
      s1._encode = function (cb) {
        setTimeout(origS1Encode, 500, cb);
      };
      s1.end();
      agent.flush(function firstFlushCallback(err) {
        t.error(err, 'no error passed to first agent.flush callback');
        t.equal(apmServer.events.length, 5, 'apmServer has 5 events');
        t.ok(apmServer.events[0].metadata, 'event[0] is metadata');
        t.equal(
          apmServer.events[1].transaction.name,
          't0',
          'event[1] is transaction t0',
        );
        t.equal(apmServer.events[2].span.name, 's2', 'event[2] is span s2');
        t.ok(apmServer.events[3].metadata, 'event[3] is metadata');
        t.equal(apmServer.events[4].span.name, 's1', 'event[4] is span s1');
        done();
      });

      const s2 = agent.startSpan('s2');
      s2.end();
      t0.end();
      agent.flush(function secondFlushCallback(err) {
        t.error(err, 'no error passed to second agent.flush callback');
        t.equal(apmServer.events.length, 3, 'apmServer has 3 events');
        t.ok(apmServer.events[0].metadata, 'event[0] is metadata');
        t.equal(
          apmServer.events[1].transaction.name,
          't0',
          'event[1] is transaction t0',
        );
        t.equal(apmServer.events[2].span.name, 's2', 'event[2] is span s2');
        done();
      });
    });
  });

  // This tests that the internally-hardcoded 1s timeout on
  // Instrumentation#flush works to prevent starvation of Agent#flush because
  // of a possibly slow or broken handling of the encoding and send of an ended
  // span.
  t.test('flush timeout from slow inflight span', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );

      const t0 = agent.startTransaction('t0');
      const s1 = agent.startSpan('s1');
      // Artificially slow down the Span#_encode for this span, so that it is
      // "in flight" for longer than the internal `INS_FLUSH_TIMEOUT_MS = 1000`
      // timeout.
      const origS1Encode = s1._encode.bind(s1);
      s1._encode = function (cb) {
        setTimeout(origS1Encode, 2000, cb);
      };
      s1.end();
      const s2 = agent.startSpan('s2');
      s2.end();
      t0.end();
      agent.flush(function (err) {
        t.error(err, 'no error passed to agent.flush callback');
        t.equal(apmServer.events.length, 3, 'apmServer got 3 events');
        t.ok(apmServer.events[0].metadata, 'event[0] is metadata');
        t.equal(
          apmServer.events[1].transaction.name,
          't0',
          'event[1] is transaction t0',
        );
        t.equal(apmServer.events[2].span.name, 's2', 'event[2] is span s2');

        apmServer.close();
        agent.destroy();
        t.end();
      });
    });
  });

  t.test(
    'flush can be used without a callback to return a Promise',
    function (t) {
      t.plan(1);

      const agent = new Agent();

      agent
        .flush()
        .then(function () {
          t.pass('should resolve the Promise for agent.flush');
          agent.destroy();
          t.end();
        })
        .catch(function (err) {
          t.error(err, 'no error passed to agent.flush callback');
        });
    },
  );

  t.end();
});

test('#captureError()', function (t) {
  let apmServer;
  let ceAgentOpts;

  t.test('setup mock APM server', function (t) {
    apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      t.comment('mock APM serverUrl: ' + serverUrl);
      ceAgentOpts = Object.assign({}, agentOpts, { serverUrl });
      t.end();
    });
  });

  // Passing a callback to `captureError` means agent.flush() will be called.
  t.test('with callback', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.captureError(new Error('with callback'), function (err, id) {
      t.error(err, 'no error from captureError callback');
      t.ok(/^[a-z0-9]{32}$/i.test(id), 'has valid error.id');
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.message, 'with callback');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('without callback', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.captureError(new Error('without callback'));
    agent.flush(function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.message, 'without callback');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('generate error id', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.captureError(new Error('foo'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.ok(/^[a-z0-9]{32}$/i.test(data.id), 'has valid error.id');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('should send a plain text message to the server', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.captureError('Hey!', function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'Hey!');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test(
    'should use `param_message` as well as `message` if given an object as 1st argument',
    function (t) {
      const agent = new Agent().start(ceAgentOpts);
      agent.captureError(
        { message: 'Hello %s', params: ['World'] },
        function () {
          t.equal(apmServer.events.length, 2, 'APM server got 2 events');
          const data = apmServer.events[1].error;
          t.strictEqual(data.log.message, 'Hello World');
          t.strictEqual(data.log.param_message, 'Hello %s');

          apmServer.clear();
          agent.destroy();
          t.end();
        },
      );
    },
  );

  t.test('should not fail on a non string err.message', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    var err = new Error();
    err.message = { foo: 'bar' };
    agent.captureError(err, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.message, '[object Object]');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test(
    'should allow custom log message together with exception',
    function (t) {
      const agent = new Agent().start(ceAgentOpts);
      agent.captureError(new Error('foo'), { message: 'bar' }, function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events');
        const data = apmServer.events[1].error;
        t.strictEqual(data.exception.message, 'foo');
        t.strictEqual(data.log.message, 'bar');

        apmServer.clear();
        agent.destroy();
        t.end();
      });
    },
  );

  t.test('should adhere to default stackTraceLimit', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.captureError(deep(256), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.stacktrace.length, DEFAULTS.stackTraceLimit);
      t.strictEqual(
        data.exception.stacktrace[0].context_line.trim(),
        'return new Error();',
      );

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('should adhere to custom stackTraceLimit', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, { stackTraceLimit: 5 }),
    );
    agent.captureError(deep(42), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.stacktrace.length, 5);
      t.strictEqual(
        data.exception.stacktrace[0].context_line.trim(),
        'return new Error();',
      );

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('should merge context', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    agent.startTransaction();
    t.strictEqual(agent.setUserContext({ a: 1, merge: { a: 2 } }), true);
    t.strictEqual(agent.setCustomContext({ a: 3, merge: { a: 4 } }), true);
    agent.captureError(
      new Error('foo'),
      {
        user: { b: 1, merge: { shallow: true } },
        custom: { b: 2, merge: { shallow: true } },
      },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events');
        const data = apmServer.events[1].error;
        t.deepEqual(data.context.user, {
          a: 1,
          b: 1,
          merge: { shallow: true },
        });
        t.deepEqual(data.context.custom, {
          a: 3,
          b: 2,
          merge: { shallow: true },
        });

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  t.test('capture location stack trace - off (error)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_NEVER,
      }),
    );
    agent.captureError(new Error('foo'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.message, 'foo');
      t.notOk('log' in data, 'should not have a log');
      assertStackTrace(t, data.exception.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - off (string)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_NEVER,
      }),
    );
    agent.captureError('foo', function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'foo');
      t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace');
      t.notOk('exception' in data, 'should not have an exception');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - off (param msg)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_NEVER,
      }),
    );
    agent.captureError({ message: 'Hello %s', params: ['World'] }, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'Hello World');
      t.notOk('stacktrace' in data.log, 'should not have a log.stacktrace');
      t.notOk('exception' in data, 'should not have an exception');

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - non-errors (error)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
      }),
    );
    agent.captureError(new Error('foo'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.exception.message, 'foo');
      t.notOk('log' in data, 'should not have a log');
      assertStackTrace(t, data.exception.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - non-errors (string)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
      }),
    );
    agent.captureError('foo', function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'foo');
      t.notOk('exception' in data, 'should not have an exception');
      assertStackTrace(t, data.log.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - non-errors (param msg)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
      }),
    );
    agent.captureError({ message: 'Hello %s', params: ['World'] }, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'Hello World');
      t.notOk('exception' in data, 'should not have an exception');
      assertStackTrace(t, data.log.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - all (error)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS,
      }),
    );
    agent.captureError(new Error('foo'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'foo');
      t.strictEqual(data.exception.message, 'foo');
      assertStackTrace(t, data.log.stacktrace);
      assertStackTrace(t, data.exception.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - all (string)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS,
      }),
    );
    agent.captureError('foo', function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'foo');
      t.notOk('exception' in data, 'should not have an exception');
      assertStackTrace(t, data.log.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture location stack trace - all (param msg)', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, {
        captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS,
      }),
    );
    agent.captureError({ message: 'Hello %s', params: ['World'] }, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      const data = apmServer.events[1].error;
      t.strictEqual(data.log.message, 'Hello World');
      t.notOk('exception' in data, 'should not have an exception');
      assertStackTrace(t, data.log.stacktrace);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('capture error before agent is started - with callback', function (t) {
    const agent = new Agent();
    agent.captureError(new Error('foo'), function (err) {
      t.strictEqual(
        err.message,
        'cannot capture error before agent is started',
      );
      agent.destroy();
      t.end();
    });
  });

  t.test(
    'capture error before agent is started - without callback',
    function (t) {
      const agent = new Agent();
      agent.captureError(new Error('foo'));
      agent.destroy();
      t.end();
    },
  );

  t.test('include valid context ids and sampled flag', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    const trans = agent.startTransaction('foo');
    const span = agent.startSpan('bar');
    agent.captureError(new Error('with callback'), function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].error;
      t.strictEqual(
        data.exception.message,
        'with callback',
        'error.exception.message',
      );
      t.strictEqual(data.id.length, 32, 'error.id is 32 characters');
      t.strictEqual(data.parent_id, span.id, 'error.parent_id matches span id');
      t.strictEqual(
        data.trace_id,
        trans.traceId,
        'error.trace_id matches transaction trace id',
      );
      t.strictEqual(
        data.transaction_id,
        trans.id,
        'error.transaction_id matches transaction id',
      );
      t.deepEqual(
        data.transaction,
        {
          name: trans.name,
          type: trans.type,
          sampled: true,
        },
        'error.transaction.*',
      );

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('custom timestamp', function (t) {
    const agent = new Agent().start(ceAgentOpts);
    const timestamp = Date.now() - 1000;
    agent.captureError(new Error('with callback'), { timestamp }, function () {
      t.equal(apmServer.events.length, 2, 'APM server got 2 events');
      assertMetadata(t, apmServer.events[0].metadata);
      const data = apmServer.events[1].error;
      t.strictEqual(data.timestamp, timestamp * 1000);

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('options.request', function (t) {
    const agent = new Agent().start(ceAgentOpts);

    const req = new http.IncomingMessage();
    req.httpVersion = '1.1';
    req.method = 'POST';
    req.url = '/foo?bar=baz#hash';
    req.socket = { remoteAddress: '127.0.0.1' };
    req.headers['content-length'] = 4;
    req.headers.string = 'foo';
    req.headers.number = 42; // in case someone messes with the headers
    req.headers.array = ['foo', 42];
    req.headers.password = 'this should be redacted'; // testing sanitizeFieldNames
    req.body = 'test';

    agent.captureError(
      new Error('with request'),
      { request: req },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events');
        assertMetadata(t, apmServer.events[0].metadata);
        const data = apmServer.events[1].error;
        t.strictEqual(data.exception.message, 'with request');
        t.deepEqual(data.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: {
            raw: '/foo?bar=baz#hash',
            protocol: 'http:',
            pathname: '/foo',
            search: '?bar=baz',
          },
          socket: { remote_address: '127.0.0.1' },
          headers: {
            'content-length': '4',
            string: 'foo',
            number: '42',
            array: ['foo', '42'],
            password: '[REDACTED]',
          },
          body: '[REDACTED]',
        });

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  // This tests that a urlencoded request body captured in an *error* event
  // is properly sanitized according to sanitizeFieldNames.
  t.test('options.request + captureBody=errors', function (t) {
    const agent = new Agent().start(
      Object.assign({}, ceAgentOpts, { captureBody: 'errors' }),
    );

    const req = new http.IncomingMessage();
    req.httpVersion = '1.1';
    req.method = 'POST';
    req.url = '/';
    req.socket = { remoteAddress: '127.0.0.1' };
    req.body = 'foo=bar&password=sekrit';
    const bodyLen = Buffer.byteLength(req.body);
    req.headers['content-length'] = String(bodyLen);
    req.headers['content-type'] = 'application/x-www-form-urlencoded';

    agent.captureError(
      new Error('with request'),
      { request: req },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events');
        assertMetadata(t, apmServer.events[0].metadata);
        const data = apmServer.events[1].error;
        t.strictEqual(data.exception.message, 'with request');
        t.deepEqual(data.context.request, {
          http_version: '1.1',
          method: 'POST',
          url: { raw: '/', protocol: 'http:', pathname: '/' },
          socket: { remote_address: '127.0.0.1' },
          headers: {
            'content-length': String(bodyLen),
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'foo=bar&password=' + encodeURIComponent('[REDACTED]'),
        });

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  t.test('options.response', function (t) {
    const agent = new Agent().start(ceAgentOpts);

    const req = new http.IncomingMessage();
    const res = new http.ServerResponse(req);
    res.statusCode = 204;
    res.headers = {
      'content-length': 4,
      string: 'foo',
      number: 42, // in case someone messes with the headers
      array: ['foo', 42],
      password: 'this should be redacted', // testing sanitizeFieldNames
    };

    agent.captureError(
      new Error('with response'),
      { response: res },
      function () {
        t.equal(apmServer.events.length, 2, 'APM server got 2 events');
        assertMetadata(t, apmServer.events[0].metadata);
        const data = apmServer.events[1].error;
        t.strictEqual(data.exception.message, 'with response');
        t.deepEqual(data.context.response, {
          status_code: 204,
          headers: {
            'content-length': '4',
            string: 'foo',
            number: '42',
            array: ['foo', '42'],
            password: '[REDACTED]',
          },
          headers_sent: false,
          finished: false,
        });

        apmServer.clear();
        agent.destroy();
        t.end();
      },
    );
  });

  t.test('options.parent', function (t) {
    const agent = new Agent().start(ceAgentOpts);

    const t0 = agent.startTransaction('t0');
    const s1 = t0.startSpan('s1');
    const s2 = t0.startSpan('s2');
    agent.captureError(new Error('no parent specified'));
    agent.captureError(new Error('t0 parent'), { parent: t0 });
    agent.captureError(new Error('s1 parent'), { parent: s1 });
    agent.captureError(new Error('null parent'), { parent: null }); // to explicitly say there is no parent
    s2.end();
    s1.end();
    t0.end();

    agent.flush(function () {
      const errNoParent = findObjInArray(
        apmServer.events,
        'error.exception.message',
        'no parent specified',
      ).error;
      t.strictEqual(errNoParent.parent_id, s2.id, 'errNoParent parent_id');
      const errT0Parent = findObjInArray(
        apmServer.events,
        'error.exception.message',
        't0 parent',
      ).error;
      t.strictEqual(errT0Parent.parent_id, t0.id, 'errT0Parent parent_id');
      const errS1Parent = findObjInArray(
        apmServer.events,
        'error.exception.message',
        's1 parent',
      ).error;
      t.strictEqual(errS1Parent.parent_id, s1.id, 'errS1Parent parent_id');
      const errNullParent = findObjInArray(
        apmServer.events,
        'error.exception.message',
        'null parent',
      ).error;
      t.strictEqual(
        errNullParent.parent_id,
        undefined,
        'errNullParent parent_id',
      );

      apmServer.clear();
      agent.destroy();
      t.end();
    });
  });

  t.test('teardown mock APM server', function (t) {
    apmServer.close();
    t.end();
  });

  t.end();
});

test('#handleUncaughtExceptions()', function (t) {
  t.test('should add itself to the uncaughtException event list', function (t) {
    t.strictEqual(process._events.uncaughtException, undefined);
    const agent = new Agent().start(agentOptsNoopTransport);
    t.strictEqual(process._events.uncaughtException, undefined);
    agent.handleUncaughtExceptions();
    t.strictEqual(process._events.uncaughtException.length, 1);

    agent.destroy();
    t.end();
  });

  t.test(
    'should not add more than one listener for the uncaughtException event',
    function (t) {
      const agent = new Agent().start(agentOptsNoopTransport);
      agent.handleUncaughtExceptions();
      var before = process._events.uncaughtException.length;
      agent.handleUncaughtExceptions();
      t.strictEqual(process._events.uncaughtException.length, before);

      agent.destroy();
      t.end();
    },
  );

  t.test('should send an uncaughtException to server', function (t) {
    const apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      const agent = new Agent().start(
        Object.assign({}, agentOpts, { serverUrl }),
      );

      let handlerErr;
      agent.handleUncaughtExceptions(function (err) {
        handlerErr = err;
      });

      process.emit('uncaughtException', new Error('uncaught'));

      setTimeout(() => {
        agent.flush(function () {
          t.equal(apmServer.events.length, 2, 'apmServer got 2 events');
          assertMetadata(t, apmServer.events[0].metadata);
          const data = apmServer.events[1].error;
          t.strictEqual(data.exception.message, 'uncaught');

          t.ok(
            handlerErr,
            'the registered uncaughtException handler was called',
          );
          t.equal(handlerErr.message, 'uncaught');

          apmServer.close();
          agent.destroy();
          t.end();
        });
      }, 200); // Hack wait for the agent's handler to finish captureError.
    });
  });

  t.end();
});

test('#active: false', function (t) {
  t.test('should not error when started in an inactive state', function (t) {
    const agent = new Agent().start({ active: false });
    t.ok(agent.startTransaction());
    t.doesNotThrow(() => agent.endTransaction());
    agent.destroy();
    t.end();
  });
});

test('patches', function (t) {
  t.test('#clearPatches(name)', function (t) {
    const agent = new Agent();
    t.ok(agent._instrumentation._patches.has('express'));
    t.doesNotThrow(() => agent.clearPatches('express'));
    t.notOk(agent._instrumentation._patches.has('express'));
    t.doesNotThrow(() => agent.clearPatches('does-not-exists'));
    agent.destroy();
    t.end();
  });

  t.test('#addPatch(name, moduleName)', function (t) {
    const agent = new Agent();
    agent.clearPatches('express');
    agent.start(agentOptsNoopTransport);

    agent.addPatch('express', './test/_patch.js');

    const before = require('express');
    const patch = require('./_patch');

    delete require.cache[require.resolve('express')];
    t.deepEqual(require('express'), patch(before));

    agent.destroy();
    t.end();
  });

  t.test('#addPatch(name, function) - does not exist', function (t) {
    const agent = new Agent();
    agent.clearPatches('express');
    agent.start(agentOptsNoopTransport);

    var replacement = {
      foo: 'bar',
    };

    agent.addPatch('express', (exports, agent, { version, enabled }) => {
      t.ok(exports);
      t.ok(agent);
      t.ok(version);
      t.ok(enabled);
      return replacement;
    });

    delete require.cache[require.resolve('express')];
    t.deepEqual(require('express'), replacement);

    agent.destroy();
    t.end();
  });

  t.test('#removePatch(name, handler)', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);

    t.notOk(agent._instrumentation._patches.has('does-not-exist'));

    agent.addPatch('does-not-exist', '/foo.js');
    t.ok(agent._instrumentation._patches.has('does-not-exist'));
    agent.removePatch('does-not-exist', '/foo.js');
    t.notOk(agent._instrumentation._patches.has('does-not-exist'));

    const handler = (exports) => exports;
    agent.addPatch('does-not-exist', handler);
    t.ok(agent._instrumentation._patches.has('does-not-exist'));
    agent.removePatch('does-not-exist', handler);
    t.notOk(agent._instrumentation._patches.has('does-not-exist'));

    agent.destroy();
    t.end();
  });

  t.test('#removePatch(name, oops) does not remove patches', function (t) {
    const agent = new Agent().start(agentOptsNoopTransport);

    const moduleName = 'removePatch-test-module';
    t.notOk(agent._instrumentation._patches.has(moduleName));

    const handler1 = function (exports) {
      return exports;
    };
    const handler2 = function (exports) {
      return exports;
    };
    agent.addPatch(moduleName, handler1);
    agent.addPatch(moduleName, handler2);
    const modulePatches = agent._instrumentation._patches.get(moduleName);
    t.ok(
      modulePatches.length === 2 &&
        modulePatches[0] === handler1 &&
        modulePatches[1] === handler2,
      'module patches are as expected',
    );

    agent.removePatch(moduleName);
    t.equal(
      agent._instrumentation._patches.get(moduleName).length,
      2,
      'still have 2 patches after removePatch(name)',
    );
    agent.removePatch(moduleName, 'this is not one of the registered handlers');
    t.equal(
      agent._instrumentation._patches.get(moduleName).length,
      2,
      'still have 2 patches after removePatch(name, oops)',
    );
    agent.removePatch(moduleName, function oops() {});
    t.equal(
      agent._instrumentation._patches.get(moduleName).length,
      2,
      'still have 2 patches after removePatch(name, function oops () {})',
    );

    agent.removePatch(moduleName, handler2);
    agent.removePatch(moduleName, handler1);
    agent.destroy();

    t.end();
  });
});

test('#registerMetric(name, labels, callback)', function (t) {
  const agent = new Agent().start(agentOptsNoopTransport);

  const mockMetrics = {
    calledCount: 0,
    callback: null,
    cbValue: 0,
    labels: null,
    name: null,
    getOrCreateGauge(...args) {
      this.calledCount++;
      this.name = args[0];
      this.callback = args[1];
      this.labels = args[2];
      this.cbValue = this.callback();
    },
    stop() {},
  };

  agent._metrics = mockMetrics;

  const cb = () => {
    return 12345;
  };
  const labels = { abc: 123 };

  // with labels
  agent.registerMetric('custom-metrics', labels, cb);

  t.strictEqual(mockMetrics.calledCount, 1);
  t.strictEqual(mockMetrics.name, 'custom-metrics');
  t.strictEqual(mockMetrics.callback, cb);
  t.strictEqual(mockMetrics.labels, labels);
  t.strictEqual(mockMetrics.cbValue, 12345);

  // without labels
  const cb2 = () => {
    return 6789;
  };
  agent.registerMetric('custom-metrics2', cb2);

  t.strictEqual(mockMetrics.calledCount, 2);
  t.strictEqual(mockMetrics.name, 'custom-metrics2');
  t.strictEqual(mockMetrics.callback, cb2);
  t.strictEqual(mockMetrics.labels, undefined);
  t.strictEqual(mockMetrics.cbValue, 6789);

  agent.destroy();
  t.end();
});
