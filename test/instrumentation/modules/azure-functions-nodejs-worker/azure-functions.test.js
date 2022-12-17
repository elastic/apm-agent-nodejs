/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const assert = require('assert')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const semver = require('semver')
const tape = require('tape')
const treekill = require('tree-kill')

const { MockAPMServer } = require('../../../_mock_apm_server')

if (!semver.satisfies(process.version, '>=14 <20')) {
  console.log(`# SKIP Azure Functions runtime ~4 does not support node ${process.version} (https://aka.ms/functions-node-versions)`)
  process.exit()
}

// XXX move these to shared util (with next.test.js)
// Match ANSI escapes (from https://stackoverflow.com/a/29497680/14444044).
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g /* eslint-disable-line no-control-regex */
/**
 * Format the given data for passing to `t.comment()`.
 *
 * - t.comment() wipes leading whitespace. Prefix lines with '|' to avoid
 *   that, and to visually group a multi-line write.
 * - Drop ANSI escape characters, because those include control chars that
 *   are illegal in XML. When we convert TAP output to JUnit XML for
 *   Jenkins, then Jenkins complains about invalid XML. `FORCE_COLOR=0`
 *   can be used to disable ANSI escapes in `next dev`'s usage of chalk,
 *   but not in its coloured exception output.
 */
function formatForTComment (data) {
  return data.toString('utf8')
    .replace(ANSI_RE, '')
    .trimRight().replace(/\n/g, '\n|') + '\n'
}

/**
 * Wait for the test "func start" to be ready.
 *
 * This polls the <http://localhost:7071/admin/functions> admin endpoint until
 * it gets a 200 response -- assuming the server is ready by then.
 * It times out after ~30s.
 *
 * @param {Test} t - This is only used to `t.comment(...)` with progress.
 * @param {Function} cb - Calls `cb(err)` if there was a timeout, `cb()` on
 *    success.
 */
function waitForServerReady (t, cb) {
  let sentinel = 15

  const pollForServerReady = () => {
    const req = http.get(
      'http://localhost:7071/admin/functions',
      {
        agent: false,
        timeout: 500
      },
      res => {
        res.resume()
        res.on('end', () => {
          if (res.statusCode !== 200) {
            scheduleNextPoll(`statusCode=${res.statusCode}`)
          } else {
            cb()
          }
        })
      }
    )
    req.on('error', err => {
      scheduleNextPoll(err.message)
    })
  }

  const scheduleNextPoll = (msg) => {
    t.comment(`[sentinel=${sentinel} ${new Date().toISOString()}] wait another 2s for server ready: ${msg}`)
    sentinel--
    if (sentinel <= 0) {
      cb(new Error('timed out'))
    } else {
      setTimeout(pollForServerReady, 2000)
    }
  }

  pollForServerReady()
}

async function makeTestRequest (t, testReq) {
  return new Promise((resolve, reject) => {
    const reqOpts = testReq.reqOpts
    const url = `http://localhost:7071${reqOpts.path}`
    t.comment(`makeTestRequest: "${testReq.testName}" (${reqOpts.method} ${url})`)
    const req = http.request(
      url,
      {
        method: reqOpts.method
      },
      res => {
        const chunks = []
        res.on('data', chunk => { chunks.push(chunk) })
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          console.log('XXX res: ', res.statusCode, res.headers)
          console.log('XXX res body: ', body.toString())
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
            } else if (typeof testReq.expectedRes.body === 'string') {
              t.equal(body.toString(), testReq.expectedRes.body, 'body')
            } else {
              t.fail(`unsupported type for TEST_REQUESTS[].expectedRes.body: ${typeof testReq.expectedRes.body}`)
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

function getEventField (e, fieldName) {
  return (e.transaction || e.error || e.span)[fieldName]
}

/**
 * Assert that the given `apmEvents` (events that the mock APM server received)
 * match all the expected APM events in `TEST_REQUESTS`.
 */
function checkExpectedApmEvents (t, apmEvents) {
  // metadata
  const evt = apmEvents.shift()
  const metadata = evt.metadata
  t.ok(metadata, 'metadata is first event')
  t.equal(metadata.service.name, 'AJsAzureFnApp', 'metadata.service.name')
  t.equal(metadata.service.framework.name, 'Azure Functions', 'metadata.service.framework.name')
  t.equal(metadata.service.framework.version, '~4', 'metadata.service.framework.version')
  t.equal(metadata.service.runtime.name, 'node', 'metadata.service.runtime.name')
  t.equal(metadata.service.node.configured_name, 'test-website-instance-id', 'metadata.service.node.configured_name')
  t.equal(metadata.cloud.provider, 'azure', 'metadata.cloud.provider')
  t.equal(metadata.cloud.region, 'test-region-name', 'metadata.cloud.region')
  t.equal(metadata.cloud.service.name, 'azure functions', 'metadata.cloud.service.name')
  t.equal(metadata.cloud.account.id, '2491fc8e-f7c1-4020-b9c6-78509919fd16', 'metadata.cloud.account.id')

  // Filter out any metadata from separate requests, and metricsets which we
  // aren't testing.
  apmEvents = apmEvents
    .filter(e => !e.metadata)
    .filter(e => !e.metricset)

  // Sort all the remaining APM events and check expectations from TEST_REQUESTS.
  apmEvents = apmEvents
    .sort((a, b) => {
      return getEventField(a, 'timestamp') < getEventField(b, 'timestamp') ? -1 : 1
    })
  TEST_REQUESTS.forEach(testReq => {
    t.comment(`check APM events for "${testReq.testName}"`)
    // Collect all events for this transaction's trace_id, and pass that to
    // the `checkApmEvents` function for this request.
    assert(apmEvents.length > 0 && apmEvents[0].transaction, `next APM event is a transaction: ${JSON.stringify(apmEvents[0])}`)
    const traceId = apmEvents[0].transaction.trace_id
    const apmEventsForReq = apmEvents.filter(e => getEventField(e, 'trace_id') === traceId)
    apmEvents = apmEvents.filter(e => getEventField(e, 'trace_id') !== traceId)
    testReq.checkApmEvents(t, apmEventsForReq)
  })

  t.equal(apmEvents.length, 0, 'no additional unexpected APM server events: ' + JSON.stringify(apmEvents))
}

// ---- tests

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i

var TEST_REQUESTS = [
  {
    testName: 'HttpFn1',
    reqOpts: { method: 'GET', path: '/api/HttpFn1' },
    expectedRes: {
      statusCode: 200,
      headers: { myfnname: 'HttpFn1' },
      body: 'this is HttpFn1'
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 1)
      const trans = apmEventsForReq[0].transaction
      t.equal(trans.name, 'GET /api/HttpFn1', 'transaction.name')
      t.equal(trans.type, 'request', 'transaction.type')
      t.equal(trans.outcome, 'success', 'transaction.outcome')
      t.equal(trans.result, 'HTTP 2xx', 'transaction.result')
      t.equal(trans.faas.name, 'AJsAzureFnApp/HttpFn1', 'transaction.faas.name')
      t.equal(trans.faas.id,
        '/subscriptions/2491fc8e-f7c1-4020-b9c6-78509919fd16/resourceGroups/my-resource-group/providers/Microsoft.Web/sites/AJsAzureFnApp/functions/HttpFn1',
        'transaction.faas.id')
      t.equal(trans.faas.trigger.type, 'http', 'transaction.faas.trigger.type')
      t.ok(UUID_RE.test(trans.faas.execution), 'transaction.faas.execution ' + trans.faas.execution)
      t.equal(trans.faas.coldstart, true, 'transaction.faas.coldstart')
      t.equal(trans.context.request.method, 'GET', 'transaction.context.request.method')
      t.equal(trans.context.request.url.full, 'http://localhost:7071/api/HttpFn1', 'transaction.context.request.url.full')
      t.ok(trans.context.request.headers, 'transaction.context.request.headers')
      t.equal(trans.context.response.status_code, 200, 'transaction.context.response.status_code')
      t.equal(trans.context.response.headers.MyFnName, 'HttpFn1', 'transaction.context.response.headers.MyFnName')
    }
  },
  {
    testName: 'HttpFn2 throws an error',
    reqOpts: { method: 'GET', path: '/api/HttpFn2' },
    expectedRes: {
      statusCode: 500
    },
    checkApmEvents: (t, apmEventsForReq) => {
      t.equal(apmEventsForReq.length, 2)
      const trans = apmEventsForReq[0].transaction
      // Only a test a subset of fields to not be redundant with previous cases.
      t.equal(trans.name, 'GET /api/HttpFn2', 'transaction.name')
      t.equal(trans.outcome, 'failure', 'transaction.outcome')
      t.equal(trans.result, 'HTTP 5xx', 'transaction.result')
      t.equal(trans.faas.name, 'AJsAzureFnApp/HttpFn2', 'transaction.faas.name')
      t.equal(trans.faas.coldstart, false, 'transaction.faas.coldstart')
      t.equal(trans.context.request.method, 'GET', 'transaction.context.request.method')
      t.equal(trans.context.response.status_code, 500, 'transaction.context.response.status_code')

      const error = apmEventsForReq[1].error
      t.equal(error.parent_id, trans.id, 'error.parent_id')
      t.deepEqual(error.transaction,
        { name: trans.name, type: trans.type, sampled: trans.sampled },
        'error.transaction')
      t.equal(error.exception.message, 'thrown error in HttpFn2', 'error.exception.message')
      t.equal(error.exception.type, 'Error', 'error.exception.type')
      t.equal(error.exception.handled, true, 'error.exception.handled')
      const topFrame = error.exception.stacktrace[0]
      t.equal(topFrame.filename, 'HttpFn2/index.js', 'topFrame.filename')
      t.equal(topFrame.lineno, 8, 'topFrame.lineno')
      t.equal(topFrame.function, 'ThrowErrorHandler', 'topFrame.function')
    }
  }
  // XXX TOTEST:
  // - failing Http trigger response for .outcome and .result
  // - Http path with *template/params* -> trans.name
  // - test 'PUT /api/HttpFn1'. What happens?
  // - test that `GET /api/httpfn1` still results in `HttpFn1` usage in fields
  //   (i.e. don't rely on the URL path for case normalization)
  // - all faas.trigger.type values: other, http, pubsub, datasource, timer
]
// TEST_REQUESTS = TEST_REQUESTS.filter(r => ~r.testName.indexOf('HttpFn2')) // XXX

tape.test('azure functions', function (suite) {
  let apmServer
  let apmServerUrl

  suite.test('setup', function (t) {
    apmServer = new MockAPMServer()
    apmServer.start(function (serverUrl) {
      apmServerUrl = serverUrl
      t.comment('mock APM apmServerUrl: ' + apmServerUrl)
      t.end()
    })
  })

  let fnAppProc
  const funcExe = path.resolve(__dirname, '../../../../node_modules/.bin/func')
  const startJs = path.resolve(__dirname, '../../../../start.js')
  const fnAppDir = path.join(__dirname, 'fixtures', 'AJsAzureFnApp') // XXX just the one fn app fixture for now
  suite.test('setup: "func start" for AJsAzureFnApp fixture', t => {
    fnAppProc = spawn(
      funcExe,
      ['start'],
      {
        cwd: fnAppDir,
        env: Object.assign({}, process.env, {
          NODE_OPTIONS: '-r ' + startJs,
          ELASTIC_APM_SERVER_URL: apmServerUrl,
          ELASTIC_APM_API_REQUEST_TIME: '2s'
        })
      }
    )
    fnAppProc.on('error', err => {
      t.error(err, 'no error from "next start"')
    })
    fnAppProc.stdout.on('data', data => {
      t.comment(`["func start" stdout] ${formatForTComment(data)}`)
    })
    fnAppProc.stderr.on('data', data => {
      t.comment(`["func start" stderr] ${formatForTComment(data)}`)
    })

    // Allow some time for an early fail of `func start`, e.g. if there is
    // already a user of port 7071...
    const onEarlyClose = code => {
      t.fail(`"func start" failed early: code=${code}`)
      fnAppProc = null
      clearTimeout(earlyCloseTimer)
      t.end()
    }
    fnAppProc.on('close', onEarlyClose)
    const earlyCloseTimer = setTimeout(() => {
      fnAppProc.removeListener('close', onEarlyClose)

      // ... then wait for the server to be ready.
      waitForServerReady(t, waitErr => {
        if (waitErr) {
          t.fail(`error waiting for "func start" to be ready: ${waitErr.message}`)
          treekill(fnAppProc.pid, 'SIGKILL')
          fnAppProc = null
        } else {
          t.comment('"func start" is ready')
        }
        t.end()
      })
    }, 1000)
  })

  suite.test('make requests', async t => {
    if (!fnAppProc) {
      t.skip('there is no fnAppProc')
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
    if (!fnAppProc) {
      t.skip('there is no fnAppProc')
      t.end()
      return
    }

    // To ensure we get all the trace data from the instrumented function app
    // server, we wait 2x the `apiRequestTime` (set above) before stopping it.
    fnAppProc.on('close', _code => {
      checkExpectedApmEvents(t, apmServer.events)
      t.end()
    })
    t.comment('wait 4s for trace data to be sent before closing "func start"')
    setTimeout(() => {
      treekill(fnAppProc.pid, 'SIGKILL')
    }, 4000) // 2x ELASTIC_APM_API_REQUEST_TIME set above
  })

  suite.test('teardown', function (t) {
    apmServer.close()
    t.end()
  })

  suite.end()
})
