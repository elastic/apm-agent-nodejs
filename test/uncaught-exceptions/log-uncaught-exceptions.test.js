'use strict'

// Test `captureExceptions` and `logUncaughtExceptions`.
//
// Because this involves testing node's process global "uncaughtException"
// handler, this is tested by exec'ing a separate process. Doing it in the
// same process as this test script can be difficult because many test
// frameworks install their own handlers for "uncaughtException". Node-tap
// does, indirectly, via an async_hooks.createHook and monkey-patching of
// `process` fields via <https://github.com/tapjs/async-hook-domain>. See
// <https://github.com/tapjs/node-tap/issues/722>.

const { exec } = require('child_process')
const http = require('http')
const zlib = require('zlib')

const ndjson = require('ndjson')
const test = require('tap').test

const script = 'use-agent-and-throw.js'

test('logUncaughtExceptions=false should capture uncaughtException but not log', function (t) {
  // This handles finishing the test when both the exec and the APM server
  // response are done.
  //
  // After https://github.com/elastic/apm-nodejs-http-client/pull/144 this can
  // be revisited -- the exec shouldn't complete until the request to APM server
  // is done.
  let finishCount = 0
  function finish () {
    finishCount++
    if (finishCount >= 2) {
      server.close()
      t.end()
    }
  }

  // 1. Start a mock APM server, expecting an error event.
  const server = http.createServer(function (req, res) {
    const parsedStream = req.pipe(zlib.createGunzip()).pipe(ndjson.parse())
    let n = 0
    parsedStream.on('data', function (obj) {
      switch (n) {
        case 0:
          t.ok(obj.metadata, 'APM server got metadata obj')
          break
        case 1:
          t.ok(obj.error, 'APM server got error obj')
          t.strictEqual(obj.error.exception.handled, false, 'error.exception.handled is false')
          t.equal(obj.error.exception.message, 'boom', 'got expected error.exception.message')
          t.equal(obj.error.exception.stacktrace[0].filename, script, 'top frame of stacktrace is the script')
          finish()
          break
        default:
          t.fail('APM server got unexpected intake obj: ' + obj)
          break
      }
      n++
    })
  })

  server.listen(function () {
    // 2. Exec the test script, configured to talk to our mock APM server.
    exec(
      `${process.execPath} ${script}`,
      {
        cwd: __dirname,
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: `http://localhost:${server.address().port}`
        }
      },
      function done (err, stdout, stderr) {
        t.ok(err, `got error from running ${script}`)
        t.equal(err.code, 1, 'exit status is 1')
        t.strictEqual(err.killed, false, 'script was not killed by a signal')
        t.equal(stdout, 'started\n', 'got expected stdout from script')
        t.equal(stderr, '', 'no stderr from script (because logUncaughtExceptions=false)')
        finish()
      }
    )
  })
})

test('logUncaughtExceptions=false should capture uncaughtException and log it to stderr', function (t) {
  // This handles finishing the test when both the exec and the APM server
  // response are done.
  //
  // After https://github.com/elastic/apm-nodejs-http-client/pull/144 this can
  // be revisited -- the exec shouldn't complete until the request to APM server
  // is done.
  let finishCount = 0
  function finish () {
    finishCount++
    if (finishCount >= 2) {
      server.close()
      t.end()
    }
  }

  // 1. Start a mock APM server, expecting an error event.
  const server = http.createServer(function (req, res) {
    const parsedStream = req.pipe(zlib.createGunzip()).pipe(ndjson.parse())
    let n = 0
    parsedStream.on('data', function (obj) {
      switch (n) {
        case 0:
          t.ok(obj.metadata, 'APM server got metadata obj')
          break
        case 1:
          t.ok(obj.error, 'APM server got error obj')
          t.strictEqual(obj.error.exception.handled, false, 'error.exception.handled is false')
          t.equal(obj.error.exception.message, 'boom', 'got expected error.exception.message')
          t.equal(obj.error.exception.stacktrace[0].filename, script, 'top frame of stacktrace is the script')
          finish()
          break
        default:
          t.fail('APM server got unexpected intake obj: ' + obj)
          break
      }
      n++
    })
  })

  server.listen(function () {
    // 2. Exec the test script, configured to talk to our mock APM server.
    exec(
      `${process.execPath} ${script}`,
      {
        cwd: __dirname,
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: `http://localhost:${server.address().port}`,
          ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS: 'true'
        }
      },
      function done (err, stdout, stderr) {
        t.ok(err, `got error from running ${script}`)
        t.equal(err.code, 1, 'exit status is 1')
        t.strictEqual(err.killed, false, 'script was not killed by a signal')
        t.equal(stdout, 'started\n', 'got expected stdout from script')
        t.ok(/^Error: boom/.test(stderr), 'got logged error on stderr (because logUncaughtExceptions=true)')
        t.ok(/at .*use-agent-and-throw.js:/.test(stderr), 'logged error includes script name')
        finish()
      }
    )
  })
})
