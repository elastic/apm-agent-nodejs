/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const assert = require('assert');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const semver = require('semver');
const tape = require('tape');
const treekill = require('tree-kill');

const { MockAPMServer } = require('../../_mock_apm_server');
const { formatForTComment } = require('../../_utils');

if (!semver.satisfies(process.version, '>=14.1.0 <19')) {
  // The "14.1.0" version is selected to skip testing on Node.js v14.0.0
  // because of the issue described here:
  // https://github.com/elastic/apm-agent-nodejs/issues/3279#issuecomment-1532084620
  console.log(
    `# SKIP Azure Functions runtime ~4 does not support node ${process.version} (https://aka.ms/functions-node-versions)`,
  );
  process.exit();
} else if (os.platform() === 'win32') {
  console.log(
    '# SKIP Azure Functions tests on Windows because of flaky azure-functions-core-tools install (see https://github.com/elastic/apm-agent-nodejs/issues/3107)',
  );
  process.exit();
}

/**
 * Wait for the test "func start" to be ready.
 *
 * This polls the <http://127.0.0.1:7071/admin/functions> admin endpoint until
 * it gets a 200 response, assuming the server is ready by then.
 * It times out after ~60s -- so long because startup on Windows CI has been
 * found to take a long time (it is downloading 250MB+ in "ExtensionBundle"s).
 *
 * @param {Test} t - This is only used to `t.comment(...)` with progress.
 * @param {Function} cb - Calls `cb(err)` if there was a timeout, `cb()` on
 *    success.
 */
function waitForServerReady(t, cb) {
  let sentinel = 30;
  const INTERVAL_MS = 2000;

  const pollForServerReady = () => {
    const req = http.get(
      'http://127.0.0.1:7071/admin/functions',
      {
        agent: false,
        timeout: 500,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          if (res.statusCode !== 200) {
            scheduleNextPoll(`statusCode=${res.statusCode}`);
          } else {
            cb();
          }
        });
      },
    );
    req.on('error', (err) => {
      scheduleNextPoll(err.message);
    });
  };

  const scheduleNextPoll = (msg) => {
    t.comment(
      `[sentinel=${sentinel} ${new Date().toISOString()}] wait another 2s for server ready: ${msg}`,
    );
    sentinel--;
    if (sentinel <= 0) {
      cb(new Error('timed out'));
    } else {
      setTimeout(pollForServerReady, INTERVAL_MS);
    }
  };

  pollForServerReady();
}

async function makeTestRequest(t, testReq) {
  return new Promise((resolve, reject) => {
    const reqOpts = testReq.reqOpts;
    const url = `http://127.0.0.1:7071${reqOpts.path}`;
    t.comment(
      `makeTestRequest: "${testReq.testName}" (${reqOpts.method} ${url})`,
    );
    const req = http.request(
      url,
      {
        method: reqOpts.method,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (testReq.expectedRes.statusCode) {
            t.equal(
              res.statusCode,
              testReq.expectedRes.statusCode,
              `res.statusCode === ${testReq.expectedRes.statusCode}`,
            );
          }
          if (testReq.expectedRes.headers) {
            for (const [k, v] of Object.entries(testReq.expectedRes.headers)) {
              if (v instanceof RegExp) {
                t.ok(
                  v.test(res.headers[k]),
                  `res.headers[${JSON.stringify(k)}] =~ ${v}`,
                );
              } else {
                t.equal(
                  res.headers[k],
                  v,
                  `res.headers[${JSON.stringify(k)}] === ${JSON.stringify(v)}`,
                );
              }
            }
          }
          if (testReq.expectedRes.body) {
            if (testReq.expectedRes.body instanceof RegExp) {
              t.ok(
                testReq.expectedRes.body.test(body),
                `body =~ ${testReq.expectedRes.body}`,
              );
            } else if (typeof testReq.expectedRes.body === 'string') {
              t.equal(body.toString(), testReq.expectedRes.body, 'body');
            } else {
              t.fail(
                `unsupported type for TEST_REQUESTS[].expectedRes.body: ${typeof testReq
                  .expectedRes.body}`,
              );
            }
          }
          resolve();
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function getEventField(e, fieldName) {
  return (e.transaction || e.error || e.span)[fieldName];
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
    t.equal(metadata.service.name, 'AJsAzureFnApp', 'metadata.service.name');
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
      'AJsAzureFnApp',
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

const fnAppDir = path.join(__dirname, 'fixtures', 'AJsAzureFnApp');
const funcExe =
  path.resolve(fnAppDir, 'node_modules/.bin/func') +
  (os.platform() === 'win32' ? '.cmd' : '');

var TEST_REQUESTS = [
  {
    testName: 'HttpFn1',
    reqOpts: { method: 'GET', path: '/api/HttpFn1' },
    expectedRes: {
      statusCode: 200, // the Azure Functions default
      headers: { myheadername: 'MyHeaderValue' },
      body: 'HttpFn1 body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFn1', 'transaction.name');
      t.equal(trans.type, 'request', 'transaction.type');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.faas.name,
        'AJsAzureFnApp/HttpFn1',
        'transaction.faas.name',
      );
      t.equal(
        trans.faas.id,
        '/subscriptions/2491fc8e-f7c1-4020-b9c6-78509919fd16/resourceGroups/my-resource-group/providers/Microsoft.Web/sites/AJsAzureFnApp/functions/HttpFn1',
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
        'http://127.0.0.1:7071/api/HttpFn1',
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
  // Only a test a subset of fields to not be redundant with previous cases.
  {
    testName: 'HttpFnError throws an error',
    reqOpts: { method: 'GET', path: '/api/HttpFnError' },
    expectedRes: {
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 2);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnError', 'transaction.name');
      t.equal(trans.outcome, 'failure', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 5xx', 'transaction.result');
      t.equal(
        trans.faas.name,
        'AJsAzureFnApp/HttpFnError',
        'transaction.faas.name',
      );
      t.equal(trans.faas.coldstart, false, 'transaction.faas.coldstart');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );

      const error = apmEventsForReq[1].error;
      t.equal(error.parent_id, trans.id, 'error.parent_id');
      t.deepEqual(
        error.transaction,
        { name: trans.name, type: trans.type, sampled: trans.sampled },
        'error.transaction',
      );
      t.equal(
        error.exception.message,
        'thrown error in HttpFnError',
        'error.exception.message',
      );
      t.equal(error.exception.type, 'Error', 'error.exception.type');
      t.equal(error.exception.handled, true, 'error.exception.handled');
      const topFrame = error.exception.stacktrace[0];
      t.equal(
        topFrame.filename,
        path.join('HttpFnError', 'index.js'),
        'topFrame.filename',
      );
      t.equal(topFrame.lineno, 8, 'topFrame.lineno');
      t.equal(topFrame.function, 'ThrowErrorHandler', 'topFrame.function');
    },
  },
  {
    testName: 'HttpFnBindingsRes',
    reqOpts: { method: 'GET', path: '/api/HttpFnBindingsRes' },
    expectedRes: {
      statusCode: 202,
      body: 'HttpFnBindingsRes body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnBindingsRes', 'transaction.name');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        202,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'HttpFnContextDone',
    reqOpts: { method: 'GET', path: '/api/HttpFnContextDone' },
    expectedRes: {
      statusCode: 202,
      body: 'HttpFnContextDone body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnContextDone', 'transaction.name');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        202,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'HttpFnReturnContext',
    reqOpts: { method: 'GET', path: '/api/HttpFnReturnContext' },
    expectedRes: {
      statusCode: 202,
      body: 'HttpFnReturnContext body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnReturnContext', 'transaction.name');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        202,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'HttpFnReturnResponseData',
    reqOpts: { method: 'GET', path: '/api/HttpFnReturnResponseData' },
    expectedRes: {
      statusCode: 202,
      body: 'HttpFnReturnResponseData body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'GET /api/HttpFnReturnResponseData',
        'transaction.name',
      );
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        202,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'HttpFnReturnObject',
    reqOpts: { method: 'GET', path: '/api/HttpFnReturnObject' },
    expectedRes: {
      statusCode: 200,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnReturnObject', 'transaction.name');
      t.equal(trans.outcome, 'success', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'HttpFnReturnString',
    reqOpts: { method: 'GET', path: '/api/HttpFnReturnString' },
    expectedRes: {
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFnReturnString', 'transaction.name');
      t.equal(trans.outcome, 'failure', 'transaction.outcome');
      t.equal(trans.result, 'HTTP 5xx', 'transaction.result');
      t.equal(
        trans.context.request.method,
        'GET',
        'transaction.context.request.method',
      );
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'GET httpfn1 (lower-case in URL path)',
    reqOpts: { method: 'GET', path: '/api/httpfn1' },
    expectedRes: {
      statusCode: 200, // the Azure Functions default
      headers: { myheadername: 'MyHeaderValue' },
      body: 'HttpFn1 body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/HttpFn1', 'transaction.name');
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.faas.name,
        'AJsAzureFnApp/HttpFn1',
        'transaction.faas.name',
      );
      t.equal(
        trans.faas.id,
        '/subscriptions/2491fc8e-f7c1-4020-b9c6-78509919fd16/resourceGroups/my-resource-group/providers/Microsoft.Web/sites/AJsAzureFnApp/functions/HttpFn1',
        'transaction.faas.id',
      );
      t.equal(
        trans.context.request.url.full,
        'http://127.0.0.1:7071/api/httpfn1',
        'transaction.context.request.url.full',
      );
    },
  },
  {
    // https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger#customize-the-http-endpoint
    testName: 'HttpFnRouteTemplate',
    reqOpts: { method: 'GET', path: '/api/products/electronics/42' },
    expectedRes: {
      statusCode: 202,
      body: 'HttpFnRouteTemplate body: category=electronics id=42',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'GET /api/products/{category:alpha}/{id:int?}',
        'transaction.name',
      );
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result');
      t.equal(
        trans.faas.name,
        'AJsAzureFnApp/HttpFnRouteTemplate',
        'transaction.faas.name',
      );
      t.equal(
        trans.faas.id,
        '/subscriptions/2491fc8e-f7c1-4020-b9c6-78509919fd16/resourceGroups/my-resource-group/providers/Microsoft.Web/sites/AJsAzureFnApp/functions/HttpFnRouteTemplate',
        'transaction.faas.id',
      );
      t.equal(
        trans.context.request.url.full,
        'http://127.0.0.1:7071/api/products/electronics/42',
        'transaction.context.request.url.full',
      );
    },
  },
  {
    testName: 'HttpFnDistTrace',
    reqOpts: { method: 'GET', path: '/api/HttpFnDistTraceA' },
    expectedRes: {
      statusCode: 200,
      body: 'HttpFnDistTraceA body',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      // Expect:
      //  trans "GET HttpFnDistTraceA"
      //  `- span "spanA"
      //     `- span "GET $HOST:$PORT"
      //        `- trans "GET HttpFnDistTraceB"
      t.equal(apmEventsForReq.length, 4);
      const t1 = apmEventsForReq[0].transaction;
      t.equal(t1.name, 'GET /api/HttpFnDistTraceA', 't1.name');
      t.equal(t1.faas.name, 'AJsAzureFnApp/HttpFnDistTraceA', 't1.faas.name');
      const s1 = apmEventsForReq[1].span;
      t.equal(s1.name, 'spanA', 's1.name');
      t.equal(s1.parent_id, t1.id, 's1 is a child of t1');
      const s2 = apmEventsForReq[2].span;
      t.equal(s2.name, `GET ${s2.context.service.target.name}`, 's2.name');
      t.equal(s2.type, 'external', 's2.type');
      t.equal(s2.parent_id, s1.id, 's2 is a child of s1');
      const t2 = apmEventsForReq[3].transaction;
      t.equal(t2.name, 'GET /api/HttpFnDistTraceB', 't2.name');
      t.equal(t2.faas.name, 'AJsAzureFnApp/HttpFnDistTraceB', 't2.faas.name');
      t.equal(t2.parent_id, s2.id, 't2 is a child of s2');
      t.equal(
        t2.context.request.headers.traceparent,
        `00-${t1.trace_id}-${s2.id}-01`,
        't2 traceparent header',
      );
      t.equal(
        t2.context.request.headers.tracestate,
        'es=s:1',
        't2 tracestate header',
      );
    },
  },
];
// TEST_REQUESTS = TEST_REQUESTS.filter(r => ~r.testName.indexOf('HttpFn1')) // Use this for dev work.

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

tape.test('azure functions', function (suite) {
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
  suite.test('setup: "func start" for AJsAzureFnApp fixture', (t) => {
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
      //    node_tests_1  | # ["func start" stderr] /app/test/instrumentation/azure-functions/fixtures/AJsAzureFnApp/node_modules/azure-functions-core-tools/bin/func: 1: Syntax error: "(" unexpected
      //    node_tests_1  | not ok 2 "func start" failed early: code=2
      // For now the workaround is to manually clean that tree before running
      // tests on a separate OS:
      //    rm -rf test/instrumentation/azure-functions/fixtures/AJsAzureFnApp/node_modules
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
