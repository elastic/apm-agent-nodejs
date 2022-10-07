/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test Next.js instrumentation.
//
// This test roughly does the following:
// - Start a MockAPMServer to capture intake requests.
// - `npm ci` to build the "a-nextjs-app" project.
// - Test instrumentation when using the Next.js production server.
//    - `npm run build && npm run start` configured to send to our MockAPMServer.
//    - Make every request in `TEST_REQUESTS` to the Next.js app.
//    - Stop the Next.js app ("apmsetup.js" will flush the APM agent on SIGTERM).
//    - Check all the received APM trace data matches the expected values in
//      `TEST_REQUESTS`.
// - Test instrumentation when using the Next.js dev server.
//    - `npm run dev`
//    - (Same as above.)

const { exec, spawn } = require('child_process')
const http = require('http')
const semver = require('semver')
const tape = require('tape')

const { MockAPMServer } = require('../../_mock_apm_server')
const { dottedLookup } = require('../../_utils')

if (semver.lt(process.version, '12.22.0')) {
  console.log(`# SKIP next does not support node ${process.version}`)
  process.exit()
}

let apmServer
let serverUrl

let TEST_REQUESTS = [
  {
    testName: 'trailing slash redirect',
    req: { method: 'GET', path: '/a-page/' },
    expectedRes: {
      statusCode: 308,
      headers: { location: '/a-page' }
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Redirect route /:path+/',
        'transaction.context.response.status_code': 308
      }
    ]
  },
  {
    testName: 'configured (in next.config.js) redirect',
    req: { method: 'GET', path: '/redirect-to-a-page' },
    expectedRes: {
      statusCode: 307,
      headers: { location: '/a-page' }
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Redirect route /redirect-to-a-page',
        'transaction.context.response.status_code': 307
      }
    ]
  },

  // Rewrites are configured in "next.config.js".
  {
    testName: 'rewrite to a page',
    req: { method: 'GET', path: '/rewrite-to-a-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      // This shows that we got the content from "pages/a-page.js".
      body: /This is APage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Rewrite route /rewrite-to-a-page -> /a-page',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'rewrite to a dynamic page',
    // XXX improve this with 'num' query param
    req: { method: 'GET', path: '/rewrite-to-a-dynamic-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is ADynamicPage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Rewrite route /rewrite-to-a-dynamic-page -> /a-dynamic-page/3.14',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'rewrite to a /public/... folder file',
    req: { method: 'GET', path: '/rewrite-to-a-public-file' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': 'image/x-icon' }
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Rewrite route /rewrite-to-a-public-file -> /favicon.ico',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'rewrite to a 404',
    req: { method: 'GET', path: '/rewrite-to-a-404' },
    expectedRes: {
      statusCode: 404
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Rewrite route /rewrite-to-a-404 -> /no-such-page',
        'transaction.context.response.status_code': 404
      }
    ]
  },
  {
    testName: 'rewrite to a external site',
    req: { method: 'GET', path: '/rewrite-external/foo' },
    expectedRes: {
      // This is a 500 because the configured `old.example.com` doesn't resolve.
      // Currently we don't capture an error for that, which is a limitation.
      statusCode: 500
    },
    expectedApmEvents: [
      {
        'transaction.name': 'Next.js Rewrite route /rewrite-external/:path* -> https://old.example.com/:path*',
        'transaction.context.response.status_code': 500
      }
    ]
  },

  {
    testName: 'index page',
    req: { method: 'GET', path: '/' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is IndexPage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'GET /',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'a page (Server-Side Generated, SSG)',
    req: { method: 'GET', path: '/a-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is APage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'GET /a-page',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'a dynamic page',
    req: { method: 'GET', path: '/a-dynamic-page/42' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is ADynamicPage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'GET /a-dynamic-page/[num]',
        'transaction.context.response.status_code': 200
      }
    ]
  },
  {
    testName: 'a server-side rendered (SSR) page',
    req: { method: 'GET', path: '/an-ssr-page' },
    expectedRes: {
      statusCode: 200,
      headers: { 'content-type': /text\/html/ },
      body: /This is AnSSRPage/
    },
    expectedApmEvents: [
      {
        'transaction.name': 'GET /an-ssr-page',
        'transaction.context.response.status_code': 200
      }
    ]
  }
]
process.env.XXX_TEST_FILTER = ''
if (process.env.XXX_TEST_FILTER) {
  TEST_REQUESTS = TEST_REQUESTS.filter(testReq => ~testReq.testName.indexOf(process.env.XXX_TEST_FILTER))
}

// XXX HERE TODO:
// - api endpoints:
// curl -i localhost:3000/api/an-api-endpoint
// curl -i localhost:3000/api/a-dynamic-api-endpoint/123
//
// - error endpoints (grok the "bugs" in NOTES)
// curl -i localhost:3000/api/an-api-endpoint-that-throws
// ... the other two /throw-in-... pages

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
function waitForServerReady (t, cb) {
  let sentinel = 10

  const pollForServerReady = () => {
    const req = http.get(
      'http://localhost:3000/api/an-api-endpoint',
      {
        agent: false,
        timeout: 500
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume()
          scheduleNextPoll(`statusCode=${res.statusCode}`)
        }
        const chunks = []
        res.on('data', chunk => { chunks.push(chunk) })
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString()
            if (body && JSON.parse(body).ping === 'pong') {
              cb()
            } else {
              scheduleNextPoll(`unexpected body: ${body}`)
            }
          } catch (bodyErr) {
            scheduleNextPoll(bodyErr.message)
          }
        })
      }
    )
    req.on('error', err => {
      scheduleNextPoll(err.message)
    })
  }

  const scheduleNextPoll = (msg) => {
    t.comment(`[sentinel=${sentinel}] wait another 1s for server ready: ${msg}`)
    sentinel--
    if (sentinel <= 0) {
      cb(new Error('timed out'))
    } else {
      setTimeout(pollForServerReady, 1000)
    }
  }

  pollForServerReady()
}

async function makeTestRequest (t, testReq) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:3000${testReq.req.path}`
    t.comment(`makeTestRequest: ${testReq.testName} (${testReq.req.method} ${url})`)
    const req = http.request(
      url,
      {
        method: testReq.req.method
      },
      res => {
        const chunks = []
        res.on('data', chunk => { chunks.push(chunk) })
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          console.log('XXX res:', res.statusCode, res.headers,
            res.headers['content-type'] && ~res.headers['content-type'].indexOf('text') && body.toString(),
            '\n--')
          if (testReq.expectedRes.statusCode) {
            t.equal(res.statusCode, testReq.expectedRes.statusCode, `res.statusCode === ${testReq.expectedRes.statusCode}`)
          }
          if (testReq.expectedRes.headers) {
            for (const [k, v] of Object.entries(testReq.expectedRes.headers)) {
              if (v instanceof RegExp) {
                t.ok(v.test(res.headers[k]), `res.headers[${JSON.stringify(k)}] =~ ${v}`)
              } else {
                t.equal(res.headers[k], v, `res.headers[${JSON.stringify(k)}] === ${JSON.stringify(v)}`)
              }
            }
          }
          if (testReq.expectedRes.body) {
            if (testReq.expectedRes.body instanceof RegExp) {
              t.ok(testReq.expectedRes.body.test(body), `body =~ ${testReq.expectedRes.body}`)
            } else {
              t.equal(body, testReq.expectedRes.body, 'body')
            }
          }
          resolve()
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * Assert that the given `apmEvents` (events that the mock APM server received)
 * match all the expected APM events in `TEST_REQUESTS`.
 */
function checkExpectedApmEvents (t, apmEvents) {
  // metadata
  let evt = apmEvents.shift()
  t.ok(evt.metadata, 'metadata is first event')
  t.equal(evt.metadata.service.name, 'a-nextjs-app', 'metadata.service.name')
  // XXX assert framework is "next" or "nextjs" or some value we pick

  // One `GET /api/an-api-endpoint` from waitForServerReady.
  evt = apmEvents.shift()
  t.equal(evt.transaction.name, 'GET /api/an-api-endpoint', 'waitForServerReady request')
  t.equal(evt.transaction.outcome, 'success', 'transaction.outcome')

  // Expected APM events from all TEST_REQUESTS.
  TEST_REQUESTS.forEach(testReq => {
    t.comment(`check APM events for "${testReq.testName}"`)
    testReq.expectedApmEvents.forEach(expectedApmEvent => {
      console.log('XXX expectedApmEvent: ', expectedApmEvent)
      evt = apmEvents.shift()
      console.log('XXX evt:'); console.dir(evt, { depth: 5 })
      for (const [k, v] of Object.entries(expectedApmEvent)) {
        t.equal(dottedLookup(evt, k), v, `${k} === ${JSON.stringify(v)}`)
      }
    })
  })

  // console.log('XXX remaining apmEvents:', apmEvents)
  t.equal(apmEvents.length, 0, 'no additional APM server events: ' + JSON.stringify(apmEvents))
}

// ---- tests

const SKIP_NPM_CI_FOR_DEV = process.env.USER === 'trentm' // XXX
if (!SKIP_NPM_CI_FOR_DEV) {
  tape.test('setup: npm ci', t => {
    const startTime = Date.now()
    exec(
      'npm ci',
      {
        cwd: __dirname
      },
      function (err, stdout, stderr) {
        t.error(err, `"npm ci" succeeded (took ${(Date.now() - startTime) / 1000}s)`)
        if (err) {
          t.comment(`$ npm ci\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`)
        }
        t.end()
      }
    )
  })
}

tape.test('setup: mock APM server', t => {
  apmServer = new MockAPMServer({ apmServerVersion: '7.15.0' })
  apmServer.start(function (serverUrl_) {
    serverUrl = serverUrl_
    t.comment('mock APM serverUrl: ' + serverUrl)
    t.end()
  })
})

// Test the Next "prod" server. I.e. `npm run build && npm run start`.
tape.test('-- prod server tests --', { skip: false /* XXX */ }, suite => {
  let nextServerProc

  suite.test('setup: npm run build', t => {
    const startTime = Date.now()
    exec(
      'npm run build',
      {
        cwd: __dirname
      },
      function (err, stdout, stderr) {
        t.error(err, `"npm run build" succeeded (took ${(Date.now() - startTime) / 1000}s)`)
        if (err) {
          t.comment(`$ npm run build\n-- stdout --\n${stdout}\n-- stderr --\n${stderr}\n--`)
        }
        t.end()
      }
    )
  })

  suite.test('setup: start Next.js prod server (npm run start)', t => {
    nextServerProc = spawn(
      'npm',
      ['run', 'start'],
      {
        cwd: __dirname,
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl
        })
      }
    )
    nextServerProc.on('error', err => {
      t.error(err, 'no error from "npm run start"')
    })
    nextServerProc.stdout.on('data', data => {
      t.comment(`[Next.js server stdout] ${data}`)
    })
    nextServerProc.stderr.on('data', data => {
      t.comment(`[Next.js server stderr] ${data}`)
    })

    // Allow some time for an early fail of `npm run start`, e.g. if there is
    // already a user of port 3000...
    const onEarlyClose = code => {
      t.fail(`"npm run start" failed early: code=${code}`)
      nextServerProc = null
      clearTimeout(earlyCloseTimer)
      t.end()
    }
    nextServerProc.on('close', onEarlyClose)
    const earlyCloseTimer = setTimeout(() => {
      nextServerProc.removeListener('close', onEarlyClose)

      // ... then wait for the server to be ready.
      waitForServerReady(t, waitErr => {
        if (waitErr) {
          t.fail(`error waiting for Next.js server to be ready: ${waitErr.message}`)
          nextServerProc.kill('SIGKILL')
          nextServerProc = null
        } else {
          t.comment('Next.js server is ready')
        }
        t.end()
      })
    }, 1000)
  })

  suite.test('make requests', async t => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc')
      t.end()
      return
    }
    apmServer.clear()

    for (let i = 0; i < TEST_REQUESTS.length; i++) {
      await makeTestRequest(t, TEST_REQUESTS[i])
    }

    t.end()
  })

  suite.test('check all APM events', t => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc')
      t.end()
      return
    }

    // To ensure we get all the trace data from the instrumented Next.js
    // server, we SIGTERM it and rely on the graceful-exit apm.flush() in
    // "apmsetup.js" to flush it.
    nextServerProc.on('close', code => {
      t.equal(code, 0, 'Next.js server exit status was 0')
      checkExpectedApmEvents(t, apmServer.events)
      t.end()
    })
    nextServerProc.kill('SIGTERM')
  })

  suite.end()
})

// Test the Next "dev" server. I.e. `npm run dev`.
tape.test('-- dev server tests --', suite => {
  let nextServerProc

  suite.test('setup: start Next.js dev server (npm run dev)', t => {
    nextServerProc = spawn(
      'npm',
      ['run', 'dev'],
      {
        cwd: __dirname,
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl
        })
      }
    )
    nextServerProc.on('error', err => {
      t.error(err, 'no error from "npm run dev"')
    })
    nextServerProc.stdout.on('data', data => {
      t.comment(`[Next.js server stdout] ${data}`)
    })
    nextServerProc.stderr.on('data', data => {
      t.comment(`[Next.js server stderr] ${data}`)
    })

    // Allow some time for an early fail of `npm run dev`, e.g. if there is
    // already a user of port 3000...
    const onEarlyClose = code => {
      t.fail(`"npm run dev" failed early: code=${code}`)
      nextServerProc = null
      clearTimeout(earlyCloseTimer)
      t.end()
    }
    nextServerProc.on('close', onEarlyClose)
    const earlyCloseTimer = setTimeout(() => {
      nextServerProc.removeListener('close', onEarlyClose)

      // ... then wait for the server to be ready.
      waitForServerReady(t, waitErr => {
        if (waitErr) {
          t.fail(`error waiting for Next.js server to be ready: ${waitErr.message}`)
          nextServerProc.kill('SIGKILL')
          nextServerProc = null
        } else {
          t.comment('Next.js server is ready')
        }
        t.end()
      })
    }, 1000)
  })

  suite.test('make requests', async t => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc')
      t.end()
      return
    }
    apmServer.clear()

    for (let i = 0; i < TEST_REQUESTS.length; i++) {
      await makeTestRequest(t, TEST_REQUESTS[i])
    }

    t.end()
  })

  suite.test('check all APM events', t => {
    if (!nextServerProc) {
      t.skip('there is no nextServerProc')
      t.end()
      return
    }

    // To ensure we get all the trace data from the instrumented Next.js
    // server, we SIGTERM it and rely on the graceful-exit apm.flush() in
    // "apmsetup.js" to flush it.
    nextServerProc.on('close', code => {
      t.equal(code, 0, 'Next.js server exit status was 0')
      checkExpectedApmEvents(t, apmServer.events)
      t.end()
    })
    nextServerProc.kill('SIGTERM')
  })

  suite.end()
})

tape.test('teardown: mock APM server', t => {
  apmServer.close()
  t.end()
})
