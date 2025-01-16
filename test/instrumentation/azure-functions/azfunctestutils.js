/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const http = require('http');

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

module.exports = {
  getEventField,
  makeTestRequest,
  waitForServerReady,
};
