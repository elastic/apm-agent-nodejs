/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

// Test Next.js instrumentation.
//
// This test roughly does the following:
// - Start a MockAPMServer to capture intake requests.
// - `npm ci` to build the "a-nextjs-app" project, if necessary.
// - Test instrumentation when using the Next.js production server.
//    - `next build && next start` configured to send to our MockAPMServer.
//    - Make every request in `TEST_REQUESTS` to the Next.js app.
//    - Stop the Next.js app ("apmsetup.js" will flush the APM agent on SIGTERM).
//    - Check all the received APM trace data matches the expected values in
//      `TEST_REQUESTS`.
// - Test instrumentation when using the Next.js dev server.
//    - `next dev`
//    - (Same as above.)

const assert = require('assert');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const semver = require('semver');
const tape = require('tape');
const treekill = require('tree-kill');

const { MockAPMServer } = require('../../../_mock_apm_server');
const { formatForTComment } = require('../../../_utils');

if (os.platform() === 'win32') {
  // Limitation: currently don't support testing on Windows.
  // The current mechanism using shell=true to spawn on Windows *and* attempting
  // to use SIGTERM to terminal the Next.js server doesn't work because cmd.exe
  // does an interactive prompt. Lovely.
  //      Terminate batch job (Y/N)?
  console.log('# SKIP Next.js testing currently is not supported on windows');
  process.exit();
}
if (semver.lt(process.version, '14.6.0')) {
  // While some earlier supported versions of Next.js work with node v12,
  // next@13 cannot even be imported with node v12 (newer JS syntax is used).
  // To simplify, and because node v12 is EOL, we skip any testing with
  // node <=14.6.0 (next@13's min supported node version).
  console.log(`# SKIP test next with node <14.6.0 (node ${process.version})`);
  process.exit();
}
if (process.env.ELASTIC_APM_CONTEXT_MANAGER === 'patch') {
  console.log(
    '# SKIP Next.js instrumentation does not work with contextManager="patch"',
  );
  process.exit();
}

const testAppDir = path.join(__dirname, 'a-nextjs-app');

let apmServer;
let nextJsVersion; // Determined after `npm ci` is run.
let serverUrl;

// TEST_REQUESTS is an array of requests to test against both a prod-server and
// dev-server run of the 'a-nextjs-app' test app. Each entry is:
//
//   {
//     testName: '<some short string name>',
//     // An object with request options, or a `(buildId) => { ... }` that
//     // returns request options.
//     reqOpts: Object | Function,
//     // An object with expectations of the server response.
//     expectedRes: { ... },
//     // Make test assertions of the APM events received for the request.
//     checkApmEvents: (t, apmEventsForReq) => { ... },
//   }
//
let TEST_REQUESTS = [
  // Redirects.
  {
    testName: 'trailing slash redirect',
    reqOpts: { method: 'GET', path: '/a-page/' },
    expectedRes: {
      statusCode: 308,
      headers: { location: '/a-page' },
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Redirect route /:path+/',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        308,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'configured (in next.config.js) redirect',
    reqOpts: { method: 'GET', path: '/redirect-to-a-page' },
    expectedRes: {
      statusCode: 307,
      headers: { location: '/a-page' },
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Redirect route /redirect-to-a-page',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        307,
        'transaction.context.response.status_code',
      );
    },
  },

  // Rewrites are configured in "next.config.js".
  {
    testName: 'rewrite to a page',
    reqOpts: { method: 'GET', path: '/rewrite-to-a-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      // This shows that we got the content from "pages/a-page.js".
      body: /This is APage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Rewrite route /rewrite-to-a-page -> /a-page',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'rewrite to a dynamic page',
    reqOpts: { method: 'GET', path: '/rewrite-to-a-dynamic-page/3.14159' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is ADynamicPage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Rewrite route /rewrite-to-a-dynamic-page/:num -> /a-dynamic-page/:num',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'rewrite to a /public/... folder file',
    reqOpts: { method: 'GET', path: '/rewrite-to-a-public-file' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': 'image/x-icon' },
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Rewrite route /rewrite-to-a-public-file -> /favicon.ico',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'rewrite to a 404',
    reqOpts: { method: 'GET', path: '/rewrite-to-a-404' },
    expectedRes: {
      statusCode: 404,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Rewrite route /rewrite-to-a-404 -> /no-such-page',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        404,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'rewrite to a external site',
    reqOpts: { method: 'GET', path: '/rewrite-external/foo' },
    expectedRes: {
      // This is a 500 because the configured `old.example.com` doesn't resolve.
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.ok(
        apmEventsForReq.length === 1 || apmEventsForReq.length === 2,
        'expected number of APM events',
      );
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js Rewrite route /rewrite-external/:path* -> https://old.example.com/:path*',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );
      // Limitation: Currently the instrumentation only captures an error with
      // the DevServer, because Next.js special cases dev-mode and calls
      // `renderErrorToResponse`. To capture the error with NextNodeServer we
      // would need to shim `Server.run()` in base-server.js.
      if (apmEventsForReq.length === 2) {
        const error = apmEventsForReq[1].error;
        t.equal(
          trans.trace_id,
          error.trace_id,
          'transaction and error are in same trace',
        );
        t.equal(
          error.parent_id,
          trans.id,
          'error is a child of the transaction',
        );
        t.equal(error.transaction.type, 'request', 'error.transaction.type');
        t.equal(error.transaction.name, trans.name, 'error.transaction.name');
        t.equal(
          error.exception.message,
          'getaddrinfo ENOTFOUND old.example.com',
          'error.exception.message',
        );
      }
    },
  },

  // The different kinds of pages.
  {
    testName: 'index page',
    reqOpts: { method: 'GET', path: '/' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is IndexPage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'a page (Server-Side Generated, SSG)',
    reqOpts: { method: 'GET', path: '/a-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is APage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /a-page', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'a dynamic page',
    reqOpts: { method: 'GET', path: '/a-dynamic-page/42' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is ADynamicPage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /a-dynamic-page/[num]', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'a server-side rendered (SSR) page',
    reqOpts: { method: 'GET', path: '/an-ssr-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is AnSSRPage/,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /an-ssr-page', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },

  // API endpoint pages
  {
    testName: 'an API endpoint page',
    reqOpts: { method: 'GET', path: '/api/an-api-endpoint' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /application\/json/ },
      body: '{"ping":"pong"}',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(trans.name, 'GET /api/an-api-endpoint', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },
  {
    testName: 'a dynamic API endpoint page',
    reqOpts: { method: 'GET', path: '/api/a-dynamic-api-endpoint/123' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /application\/json/ },
      body: '{"num":"123","n":123,"double":246,"floor":123}',
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'GET /api/a-dynamic-api-endpoint/[num]',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },

  // Various internal Next.js routes.
  // The other routes that our instrumentation covers are listed in
  // `wrapFsRoute` in "next-server.js" and "next-dev-server.js".
  {
    testName: '"_next/data catchall" route',
    reqOpts: (buildId) => {
      return { method: 'GET', path: `/_next/data/${buildId}/a-page.json` };
    },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /application\/json/ },
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1);
      const trans = apmEventsForReq[0].transaction;
      t.equal(
        trans.name,
        'Next.js _next/data route /a-page',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        200,
        'transaction.context.response.status_code',
      );
    },
  },

  // Error capture cases
  {
    testName: 'an API endpoint that throws',
    // Limitation: In Next.js commit 6bc7c4d9c (included in 12.0.11-canary.14),
    // the `apiResolver()` method that we instrument was moved from
    // next/dist/server/api-utils.js to next/dist/server/api-utils/node.js.
    // We instrument the latter. To support error capture in API endpoint
    // handlers in early versions we'd need to instrument the former path as well.
    nextVersionRange: '>=12.0.11-canary.14',
    reqOpts: { method: 'GET', path: '/api/an-api-endpoint-that-throws' },
    expectedRes: {
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 2);
      const trans = apmEventsForReq[0].transaction;
      const error = apmEventsForReq[1].error;
      t.equal(
        trans.name,
        'GET /api/an-api-endpoint-that-throws',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );
      t.ok(error, 'captured an APM error');
      t.equal(
        trans.trace_id,
        error.trace_id,
        'transaction and error are in same trace',
      );
      t.equal(error.parent_id, trans.id, 'error is a child of the transaction');
      t.equal(error.transaction.type, 'request', 'error.transaction.type');
      t.equal(error.transaction.name, trans.name, 'error.transaction.name');
      t.equal(
        error.exception.message,
        'An error thrown in anApiEndpointThatThrows handler',
        'error.exception.message',
      );
    },
  },
  {
    testName: 'a throw in a page handler',
    reqOpts: { method: 'GET', path: '/a-throw-in-page-handler' },
    expectedRes: {
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 2);
      const trans = apmEventsForReq[0].transaction;
      const error = apmEventsForReq[1].error;
      t.equal(trans.name, 'GET /a-throw-in-page-handler', 'transaction.name');
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );
      t.ok(error, 'captured an APM error');
      t.equal(
        trans.trace_id,
        error.trace_id,
        'transaction and error are in same trace',
      );
      t.equal(error.parent_id, trans.id, 'error is a child of the transaction');
      t.equal(error.transaction.type, 'request', 'error.transaction.type');
      t.equal(error.transaction.name, trans.name, 'error.transaction.name');
      t.equal(
        error.exception.message,
        'throw in page handler',
        'error.exception.message',
      );
    },
  },
  {
    testName: 'a throw in getServerSideProps',
    // Limitation: There was a bug in v11.1.0 where the error handling flow in
    // the *dev* server was incomplete. This was fixed in
    // https://github.com/vercel/next.js/pull/28520, included in version
    // 11.1.1-canary.18.
    nextVersionRange: '>=11.1.1-canary.18',
    reqOpts: { method: 'GET', path: '/a-throw-in-getServerSideProps' },
    expectedRes: {
      statusCode: 500,
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 2);
      const trans = apmEventsForReq[0].transaction;
      const error = apmEventsForReq[1].error;
      t.equal(
        trans.name,
        'GET /a-throw-in-getServerSideProps',
        'transaction.name',
      );
      t.equal(
        trans.context.response.status_code,
        500,
        'transaction.context.response.status_code',
      );
      t.ok(error, 'captured an APM error');
      t.equal(
        trans.trace_id,
        error.trace_id,
        'transaction and error are in same trace',
      );
      t.equal(error.parent_id, trans.id, 'error is a child of the transaction');
      t.equal(error.transaction.type, 'request', 'error.transaction.type');
      t.equal(error.transaction.name, trans.name, 'error.transaction.name');
      t.equal(
        error.exception.message,
        'thrown error in getServerSideProps',
        'error.exception.message',
      );
    },
  },
];
// Dev Note: To limit a test run to a particular test request, provide a
// string value to DEV_TEST_FILTER that matches `testName`.
var DEV_TEST_FILTER = null;
if (DEV_TEST_FILTER) {
  TEST_REQUESTS = TEST_REQUESTS.filter(
    (testReq) => ~testReq.testName.indexOf(DEV_TEST_FILTER),
  );
  assert(
    TEST_REQUESTS.length > 0,
    'DEV_TEST_FILTER should not result in an *empty* TEST_REQUESTS',
  );
}

// ---- utility functions

/**
 * Wait for the test a-nextjs-app server to be ready.
 *
 * This polls `GET /api/an-api-endpoint` until the expected 200 response is
 * received. It times out after ~10s.
 *
 * @param {Test} t - This is only used to `t.comment(...)` with progress.
 * @param {Function} cb - Calls `cb(err)` if there was a timeout, `cb()` on
 *    success.
 */
function waitForServerReady(t, cb) {
  let sentinel = 10;

  const pollForServerReady = () => {
    const req = http.get(
      'http://localhost:3000/api/an-api-endpoint',
      {
        agent: false,
        timeout: 500,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          scheduleNextPoll(`statusCode=${res.statusCode}`);
        }
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            if (body && JSON.parse(body).ping === 'pong') {
              cb();
            } else {
              scheduleNextPoll(`unexpected body: ${body}`);
            }
          } catch (bodyErr) {
            scheduleNextPoll(bodyErr.message);
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
      `[sentinel=${sentinel} ${new Date().toISOString()}] wait another 1s for server ready: ${msg}`,
    );
    sentinel--;
    if (sentinel <= 0) {
      cb(new Error('timed out'));
    } else {
      setTimeout(pollForServerReady, 1000);
    }
  };

  pollForServerReady();
}

async function makeTestRequest(t, testReq, buildId) {
  return new Promise((resolve, reject) => {
    let reqOpts = testReq.reqOpts;
    if (typeof reqOpts === 'function') {
      reqOpts = reqOpts(buildId);
    }
    const url = `http://localhost:3000${reqOpts.path}`;
    t.comment(
      `makeTestRequest: ${testReq.testName} (${reqOpts.method} ${url})`,
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
 * Return the buildId for this Next.js prod server. The buildId is stored
 * in ".next/BUILD_ID" by `next build`.
 */
function getNextProdServerBuildId() {
  const buildIdPath = path.join(testAppDir, '.next', 'BUILD_ID');
  return fs.readFileSync(buildIdPath, 'utf8').trim();
}

/**
 * Assert that the given `apmEvents` (events that the mock APM server received)
 * match all the expected APM events in `TEST_REQUESTS`.
 */
function checkExpectedApmEvents(t, apmEvents) {
  // metadata
  let evt = apmEvents.shift();
  t.ok(evt.metadata, 'metadata is first event');
  t.equal(evt.metadata.service.name, 'a-nextjs-app', 'metadata.service.name');
  t.equal(
    evt.metadata.service.framework.name,
    'Next.js',
    'metadata.service.framework.name',
  );
  t.equal(
    evt.metadata.service.framework.version,
    nextJsVersion,
    'metadata.service.framework.version',
  );

  // Filter out any metadata from separate requests, and metricsets which we
  // aren't testing.
  apmEvents = apmEvents.filter((e) => !e.metadata).filter((e) => !e.metricset);

  // One `GET /api/an-api-endpoint` from waitForServerReady.
  evt = apmEvents.shift();
  t.equal(
    evt.transaction.name,
    'GET /api/an-api-endpoint',
    'waitForServerReady request',
  );
  t.equal(evt.transaction.outcome, 'success', 'transaction.outcome');

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
    assert(
      apmEvents.length > 0 && apmEvents[0].transaction,
      `next APM event is a transaction: ${JSON.stringify(apmEvents[0])}`,
    );
    const traceId = apmEvents[0].transaction.trace_id;
    const apmEventsForReq = apmEvents.filter(
      (e) => getEventField(e, 'trace_id') === traceId,
    );
    apmEvents = apmEvents.filter(
      (e) => getEventField(e, 'trace_id') !== traceId,
    );
    testReq.checkApmEvents(t, apmEventsForReq);
  });

  t.equal(
    apmEvents.length,
    0,
    'no additional unexpected APM server events: ' + JSON.stringify(apmEvents),
  );
}

// ---- tests

// We need to `npm ci` for a first test run. However, *only* for a first test
// run, otherwise this will override any possible `npm install --no-save ...`
// changes made by a TAV runner.
const haveNodeModules = fs.existsSync(
  path.join(testAppDir, 'node_modules', '.bin', 'next'),
);
tape.test(
  `setup: npm ci (in ${testAppDir})`,
  { skip: haveNodeModules },
  (t) => {
    const startTime = Date.now();
    exec(
      'npm ci',
      {
        cwd: testAppDir,
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

tape.test('setup: filter TEST_REQUESTS', (t) => {
  // This version can only be fetched after the above `npm ci`.
  nextJsVersion = require(path.join(
    testAppDir,
    'node_modules/next/package.json',
  )).version;

  // Some entries in TEST_REQUESTS are only run for newer versions of Next.js.
  TEST_REQUESTS = TEST_REQUESTS.filter((testReq) => {
    if (
      testReq.nextVersionRange &&
      !semver.satisfies(nextJsVersion, testReq.nextVersionRange, {
        includePrerelease: true,
      })
    ) {
      t.comment(
        `skip "${testReq.testName}" because next@${nextJsVersion} does not satisfy "${testReq.nextVersionRange}"`,
      );
      return false;
    } else {
      return true;
    }
  });

  t.end();
});

tape.test('setup: mock APM server', (t) => {
  apmServer = new MockAPMServer({ apmServerVersion: '7.15.0' });
  apmServer.start(function (serverUrl_) {
    serverUrl = serverUrl_;
    t.comment('mock APM serverUrl: ' + serverUrl);
    t.end();
  });
});

// Test the Next "prod" server. I.e. `next build && next start`.
tape.test('-- prod server tests --', (suite) => {
  let nextServerProc;

  suite.test('setup: npm run build', (t) => {
    const startTime = Date.now();
    exec(
      'npm run build',
      {
        cwd: testAppDir,
      },
      function (err, stdout, stderr) {
        t.error(
          err,
          `"npm run build" succeeded (took ${
            (Date.now() - startTime) / 1000
          }s)`,
        );
        if (err) {
          t.comment(
            `$ npm run build\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`,
          );
        }
        t.end();
      },
    );
  });

  suite.test('setup: start Next.js prod server (next start)', (t) => {
    // Ideally we would simply spawn `npm run start` -- which handles setting
    // NODE_OPTIONS. However, that results in a process tree:
    //    <PID 0>
    //    `- npm
    //       `- /tmp/.../tmp-$hash.sh
    //          `- node ./node_modules/.bin/next start
    // that, in Docker, will reduce to:
    //    <PID 0>
    //    `- node ./node_modules/.bin/next start
    // And our attempts to signal, `nextServerProc.kill()`, will fail to signal
    // the actual server because the `npm` process is gone.
    nextServerProc = spawn(
      path.normalize('./node_modules/.bin/next'),
      // Be explicit about "localhost" here, otherwise with node v18 we can
      // get the server listening on IPv6 and the client connecting on IPv4.
      ['start', '-H', 'localhost'],
      {
        shell: os.platform() === 'win32',
        cwd: testAppDir,
        env: Object.assign({}, process.env, {
          NODE_OPTIONS: '-r ../../../../../start-next.js',
          ELASTIC_APM_SERVER_URL: serverUrl,
          ELASTIC_APM_API_REQUEST_TIME: '2s',
          // Disable Next.js telemetry (https://nextjs.org/telemetry),
          // otherwise get additional `POST telemetry.nextjs.org` spans that
          // break assertions.
          NEXT_TELEMETRY_DISABLED: '1',
        }),
      },
    );
    nextServerProc.on('error', (err) => {
      t.error(err, 'no error from "next start"');
    });
    nextServerProc.stdout.on('data', (data) => {
      t.comment(`[Next.js server stdout] ${formatForTComment(data)}`);
    });
    nextServerProc.stderr.on('data', (data) => {
      t.comment(`[Next.js server stderr] ${formatForTComment(data)}`);
    });

    // Allow some time for an early fail of `next start`, e.g. if there is
    // already a user of port 3000...
    const onEarlyClose = (code) => {
      t.fail(`"next start" failed early: code=${code}`);
      nextServerProc = null;
      clearTimeout(earlyCloseTimer);
      t.end();
    };
    nextServerProc.on('close', onEarlyClose);
    const earlyCloseTimer = setTimeout(() => {
      nextServerProc.removeListener('close', onEarlyClose);

      // ... then wait for the server to be ready.
      waitForServerReady(t, (waitErr) => {
        if (waitErr) {
          t.fail(
            `error waiting for Next.js server to be ready: ${waitErr.message}`,
          );
          nextServerProc.kill('SIGKILL');
          nextServerProc = null;
        } else {
          t.comment('Next.js server is ready');
        }
        t.end();
      });
    }, 1000);
  });

  suite.test('make requests', async (t) => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc');
      t.end();
      return;
    }

    const buildId = getNextProdServerBuildId();
    apmServer.clear();
    for (let i = 0; i < TEST_REQUESTS.length; i++) {
      await makeTestRequest(t, TEST_REQUESTS[i], buildId);
    }
    t.end();
  });

  suite.test('check all APM events', (t) => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc');
      t.end();
      return;
    }

    // To ensure we get all the trace data from the instrumented Next.js
    // server, we wait 2x the `apiRequestTime` (set above) before stopping it.
    nextServerProc.on('close', (code) => {
      t.equal(code, 0, 'Next.js server exit status was 0');
      checkExpectedApmEvents(t, apmServer.events);
      t.end();
    });
    setTimeout(() => {
      nextServerProc.kill('SIGTERM');
    }, 4000); // 2x ELASTIC_APM_API_REQUEST_TIME set above
  });

  suite.end();
});

// Test the Next "dev" server. I.e. `next dev`.
tape.test('-- dev server tests --', (suite) => {
  let nextServerProc;

  suite.test('setup: start Next.js dev server (next dev)', (t) => {
    // See the warning notes for `spawn()` above. The same apply here.
    nextServerProc = spawn(
      path.normalize('./node_modules/.bin/next'),
      ['dev', '-H', 'localhost'],
      {
        shell: os.platform() === 'win32',
        cwd: testAppDir,
        env: Object.assign({}, process.env, {
          NODE_OPTIONS: '-r ../../../../../start-next.js',
          ELASTIC_APM_SERVER_URL: serverUrl,
          ELASTIC_APM_API_REQUEST_TIME: '2s',
          // Disable Next.js telemetry (https://nextjs.org/telemetry),
          // otherwise get additional `POST telemetry.nextjs.org` spans that
          // break assertions.
          NEXT_TELEMETRY_DISABLED: '1',
        }),
      },
    );
    nextServerProc.on('error', (err) => {
      t.error(err, 'no error from "next dev"');
    });
    nextServerProc.stdout.on('data', (data) => {
      t.comment(`[Next.js server stdout] ${formatForTComment(data)}`);
    });
    nextServerProc.stderr.on('data', (data) => {
      t.comment(`[Next.js server stderr] ${formatForTComment(data)}`);
    });

    // Allow some time for an early fail of `next dev`, e.g. if there is
    // already a user of port 3000...
    const onEarlyClose = (code) => {
      t.fail(`"next dev" failed early: code=${code}`);
      nextServerProc = null;
      clearTimeout(earlyCloseTimer);
      t.end();
    };
    nextServerProc.on('close', onEarlyClose);
    const earlyCloseTimer = setTimeout(() => {
      nextServerProc.removeListener('close', onEarlyClose);

      // ... then wait for the server to be ready.
      waitForServerReady(t, (waitErr) => {
        if (waitErr) {
          t.fail(
            `error waiting for Next.js server to be ready: ${waitErr.message}`,
          );
          treekill(nextServerProc.pid, 'SIGKILL');
          nextServerProc = null;
        } else {
          t.comment('Next.js server is ready');
        }
        t.end();
      });
    }, 1000);
  });

  suite.test('make requests', async (t) => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc');
      t.end();
      return;
    }
    apmServer.clear();

    for (let i = 0; i < TEST_REQUESTS.length; i++) {
      await makeTestRequest(t, TEST_REQUESTS[i], 'development');
    }

    t.end();
  });

  suite.test('check all APM events', (t) => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc');
      t.end();
      return;
    }

    // To ensure we get all the trace data from the instrumented Next.js
    // server, we wait 2x the `apiRequestTime` (set above) before stopping it.
    nextServerProc.on('close', (code) => {
      t.equal(code, 0, 'Next.js server exit status was 0');
      checkExpectedApmEvents(t, apmServer.events);
      t.end();
    });
    setTimeout(() => {
      treekill(nextServerProc.pid, 'SIGTERM');
    }, 4000); // 2x ELASTIC_APM_API_REQUEST_TIME set above
  });

  suite.end();
});

tape.test('teardown: mock APM server', (t) => {
  apmServer.close();
  t.end();
});
