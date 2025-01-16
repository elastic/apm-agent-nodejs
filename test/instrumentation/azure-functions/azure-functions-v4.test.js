/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test Azure Functions programming model v4.

const assert = require('assert');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const semver = require('semver');
const tape = require('tape');
const treekill = require('tree-kill');

const { MockAPMServer } = require('../../_mock_apm_server');
const { formatForTComment } = require('../../_utils');
const {
  getEventField,
  makeTestRequest,
  waitForServerReady,
} = require('./azfunctestutils');

// Azure Functions programming model v4 supports node 18.x-20.x:
// https://learn.microsoft.com/en-ca/azure/azure-functions/functions-reference-node?tabs=javascript%2Cwindows%2Cazure-cli&pivots=nodejs-model-v4#supported-versions
// However, let's only test with node 20.x for now. The testing involves
// installing the ridiculously large "azure-functions-core-tools" dep, so it
// isn't worth testing all versions.
if (!semver.satisfies(process.version, '^20.0.1')) {
  console.log(
    '# SKIP Azure Functions v4 tests, only testing with Node.js v20.latest',
  );
  process.exit();
} else if (os.platform() === 'win32') {
  console.log(
    '# SKIP Azure Functions tests on Windows because of flaky azure-functions-core-tools install (see https://github.com/elastic/apm-agent-nodejs/issues/3107)',
  );
  process.exit();
}

/**
 * Assert that the given `apmEvents` (events that the mock APM server received)
 * match all the expected APM events in `TEST_REQUESTS`.
 */
function checkExpectedApmEvents(t, apmEvents) {
  // metadata
  if (apmEvents.length > 0) {
    const metadata = apmEvents.shift().metadata;
    t.ok(metadata, 'metadata is first event');
    t.equal(metadata.service.name, 'azfunc4', 'metadata.service.name');
    t.equal(
      metadata.service.framework.name,
      'Azure Functions',
      'metadata.service.framework.name',
    );
    t.equal(
      metadata.service.framework.version,
      '~4',
      'metadata.service.framework.version',
    );
    t.equal(
      metadata.service.runtime.name,
      'node',
      'metadata.service.runtime.name',
    );
    t.equal(
      metadata.service.node.configured_name,
      'test-website-instance-id',
      'metadata.service.node.configured_name',
    );
    t.equal(
      metadata.cloud.account.id,
      '2491fc8e-f7c1-4020-b9c6-78509919fd16',
      'metadata.cloud.account.id',
    );
    t.equal(
      metadata.cloud.instance.name,
      'azfunc4',
      'metadata.cloud.instance.name',
    );
    t.equal(
      metadata.cloud.project.name,
      'my-resource-group',
      'metadata.cloud.project.name',
    );
    t.equal(metadata.cloud.provider, 'azure', 'metadata.cloud.provider');
    t.equal(metadata.cloud.region, 'test-region-name', 'metadata.cloud.region');
    t.equal(
      metadata.cloud.service.name,
      'functions',
      'metadata.cloud.service.name',
    );
  }

  // Filter out any metadata from separate requests, and metricsets which we
  // aren't testing.
  apmEvents = apmEvents.filter((e) => !e.metadata).filter((e) => !e.metricset);

  // Sort all the remaining APM events and check expectations from TEST_REQUESTS.
  apmEvents = apmEvents.sort((a, b) => {
    return getEventField(a, 'timestamp') < getEventField(b, 'timestamp')
      ? -1
      : 1;
  });
  TEST_REQUESTS.forEach((testReq) => {
    t.comment(`check APM events for "${testReq.testName}"`);
    // Collect all events for this transaction's trace_id, and pass that to
    // the `checkApmEvents` function for this request.
    let apmEventsForReq = [];
    if (apmEvents.length > 0) {
      assert(
        apmEvents[0].transaction,
        `next APM event is a transaction: ${JSON.stringify(apmEvents[0])}`,
      );
      const traceId = apmEvents[0].transaction.trace_id;
      apmEventsForReq = apmEvents.filter(
        (e) => getEventField(e, 'trace_id') === traceId,
      );
      apmEvents = apmEvents.filter(
        (e) => getEventField(e, 'trace_id') !== traceId,
      );
    }
    testReq.checkApmEvents(t, apmEventsForReq);
  });

  t.equal(
    apmEvents.length,
    0,
    'no additional unexpected APM server events: ' + JSON.stringify(apmEvents),
  );
}

// ---- tests

const UUID_RE =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

const fnAppDir = path.join(__dirname, 'fixtures', 'azfunc4');
const funcExe =
  path.resolve(fnAppDir, 'node_modules/.bin/func') +
  (os.platform() === 'win32' ? '.cmd' : '');

var TEST_REQUESTS = [
  {
    testName: 'HttpExample',
    reqOpts: { method: 'GET', path: '/api/HttpExample' },
    expectedRes: {
      statusCode: 200, // the Azure Functions default
      headers: { myheadername: 'MyHeaderValue' },
      body: 'HttpExample body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpExample', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(trans.faas.name, 'azfunc4/HttpExample', 'transaction.faas.name');
      t.equal(
        trans.faas.id,
        '/subscriptions/2491fc8e-f7c1-4020-b9c6-78509919fd16/resourceGroups/my-resource-group/providers/Microsoft.Web/sites/azfunc4/functions/HttpExample',
        'transaction.faas.id',
      );
      t.equal(trans.faas.trigger.type, 'http', 'transaction.faas.trigger.type');
      t.ok(
        UUID_RE.test(trans.faas.execution),
        'transaction.faas.execution ' + trans.faas.execution,
      );
      t.equal(trans.faas.coldstart, true, 'transaction.faas.coldstart');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.request.url.full,
        'http://127.0.0.1:7071/api/HttpExample',
        'transaction.context.request.url.full',
      );
      t.ok(
        trans.context.request.headers,
        'transaction.context.request.headers',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
      t.equal(
        trans.context.response.headers.MyHeaderName,
        'MyHeaderValue',
        'transaction.context.response.headers.MyHeaderName',
      );
    },
  },
  // TODO: test more of the cases that are covered in azure-functions-v3.test.js
];

// We need to `npm ci` for a first test run.
tape.test(
  `setup: npm ci (in ${fnAppDir})`,
  { skip: fs.existsSync(funcExe) },
  (t) => {
    const startTime = Date.now();
    exec(
      'npm ci',
      {
        cwd: fnAppDir,
      },
      function (err, stdout, stderr) {
        t.error(
          err,
          `"npm ci" succeeded (took ${(Date.now() - startTime) / 1000}s)`,
        );
        if (err) {
          t.comment(
            `$ npm ci\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`,
          );
        }
        t.end();
      },
    );
  },
);

tape.test('azure functions v4', function (suite) {
  let apmServer;
  let apmServerUrl;

  suite.test('setup', function (t) {
    apmServer = new MockAPMServer();
    apmServer.start(function (serverUrl) {
      apmServerUrl = serverUrl;
      t.comment('mock APM apmServerUrl: ' + apmServerUrl);
      t.end();
    });
  });

  let fnAppProc;
  suite.test('setup: "func start" for azfunc4 fixture', (t) => {
    fnAppProc = spawn(funcExe, ['start'], {
      cwd: fnAppDir,
      env: Object.assign({}, process.env, {
        ELASTIC_APM_SERVER_URL: apmServerUrl,
        ELASTIC_APM_API_REQUEST_TIME: '2s',
      }),
    });
    fnAppProc.on('error', (err) => {
      t.error(err, 'no error from "func start"');
    });
    fnAppProc.stdout.on('data', (data) => {
      t.comment(`["func start" stdout] ${formatForTComment(data)}`);
    });
    fnAppProc.stderr.on('data', (data) => {
      t.comment(`["func start" stderr] ${formatForTComment(data)}`);
    });

    // Allow some time for an early fail of `func start`, e.g. if there is
    // already a user of port 7071...
    const onEarlyClose = (code) => {
      // Warning/Limitation: The 'npm ci' above installs platform-specific
      // binaries to "$fnAppDir/node_modules/azure-functions-core-tools/...",
      // which means a local test run on macOS followed by an attempted test run
      // in Docker will result in a crash:
      //    node_tests_1  | # ["func start" stderr] /app/test/instrumentation/azure-functions/fixtures/azfunc3/node_modules/azure-functions-core-tools/bin/func: 1: Syntax error: "(" unexpected
      //    node_tests_1  | not ok 2 "func start" failed early: code=2
      // For now the workaround is to manually clean that tree before running
      // tests on a separate OS:
      //    rm -rf test/instrumentation/azure-functions/fixtures/azfunc3/node_modules
      t.fail(`"func start" failed early: code=${code}`);
      fnAppProc = null;
      clearTimeout(earlyCloseTimer);
      t.end();
    };
    fnAppProc.on('close', onEarlyClose);
    const earlyCloseTimer = setTimeout(() => {
      fnAppProc.removeListener('close', onEarlyClose);

      // ... then wait for the server to be ready.
      waitForServerReady(t, (waitErr) => {
        if (waitErr) {
          t.fail(
            `error waiting for "func start" to be ready: ${waitErr.message}`,
          );
          treekill(fnAppProc.pid, 'SIGKILL');
          fnAppProc = null;
        } else {
          t.comment('"func start" is ready');
        }
        t.end();
      });
    }, 1000);
  });

  suite.test('make requests', async (t) => {
    if (!fnAppProc) {
      t.skip('there is no fnAppProc');
      t.end();
      return;
    }

    apmServer.clear();
    for (let i = 0; i < TEST_REQUESTS.length; i++) {
      await makeTestRequest(t, TEST_REQUESTS[i]);
    }

    t.end();
  });

  suite.test('check all APM events', (t) => {
    if (!fnAppProc) {
      t.skip('there is no fnAppProc');
      t.end();
      return;
    }

    // To ensure we get all the trace data from the instrumented function app
    // server, we wait 2x the `apiRequestTime` (set above) before stopping it.
    fnAppProc.on('close', (_code) => {
      checkExpectedApmEvents(t, apmServer.events);
      t.end();
    });
    t.comment('wait 4s for trace data to be sent before closing "func start"');
    setTimeout(() => {
      treekill(fnAppProc.pid, 'SIGKILL');
    }, 4000); // 2x ELASTIC_APM_API_REQUEST_TIME set above
  });

  suite.test('teardown', function (t) {
    apmServer.close();
    t.end();
  });

  suite.end();
});
