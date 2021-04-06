'use strict'

const { exec } = require('child_process')
const http = require('http')
const path = require('path')
const zlib = require('zlib')

const ndjson = require('ndjson')
const test = require('tap').test

// ---- support functions

// This test helper will:
//
// 1. Start a mock APM server that expects to receive an error event on
//    the intake API.
// 2. Exec a script that will:
//      apm.captureError(require(libToImport)())
//
// The idea is to test source-map handling for that `libToImport` file. It
// exports a function that returns an error. Does the source-map handling
// for the APM agent's `captureError` do the right thing?
//
// We run the script out of process to avoid Error.prepareStackTrace contention
// from the test framework -- which occurs with node-tap at least.
function runGivenExportAndGetApmServerErrorEvent (t, libToImport, cb) {
  let theError

  const driverScript = 'fixtures/call-export-from-given-import.js'

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
          theError = obj.error
          break
        default:
          t.fail('APM server got unexpected intake obj: ' + obj)
          break
      }
      n++
    })
    parsedStream.on('end', function () {
      res.end()
    })
  })

  server.listen(function () {
    // 2. Exec the driver script, configured to talk to our mock APM server.
    exec(
      `${process.execPath} ${driverScript} ${libToImport}`,
      {
        cwd: __dirname,
        // Sanity timeout so this doesn't hang, or wait for the APM agent's
        // longer timeouts for APM server comms.
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: `http://localhost:${server.address().port}`
        }
      },
      function done (err, stdout, stderr) {
        t.ifError(err, `no error from running ${driverScript}`)
        t.equal(stdout, 'started\nfinished\n', 'got expected stdout from the driverScript')
        t.equal(stderr, '', 'no stderr from the driverScript')

        server.close()
        cb(theError)
      }
    )
  })
}

function assertSourceFound (t, error) {
  t.strictEqual(error.exception.message, 'foo')
  t.strictEqual(error.exception.type, 'Error')
  t.strictEqual(error.culprit, `generateError (${path.join('fixtures', 'src', 'error.js')})`)

  var frame = error.exception.stacktrace[0]
  t.strictEqual(frame.filename, path.join('fixtures', 'src', 'error.js'))
  t.strictEqual(frame.lineno, 2)
  t.strictEqual(frame.function, 'generateError')
  t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1)
  t.strictEqual(frame.abs_path, path.join(__dirname, 'fixtures', 'src', 'error.js'))
  t.deepEqual(frame.pre_context, ['// Just a little prefixing line'])
  t.strictEqual(frame.context_line, 'const generateError = (msg = \'foo\') => new Error(msg)')
  t.deepEqual(frame.post_context, ['', 'module.exports = generateError'])
}

function assertSourceNotFound (t, error) {
  t.strictEqual(error.exception.message, 'foo')
  t.strictEqual(error.exception.type, 'Error')
  t.strictEqual(error.culprit, `generateError (${path.join('fixtures', 'src', 'not', 'found.js')})`)

  var frame = error.exception.stacktrace[0]
  t.strictEqual(frame.filename, path.join('fixtures', 'src', 'not', 'found.js'))
  t.strictEqual(frame.lineno, 2)
  t.strictEqual(frame.function, 'generateError')
  t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1)
  t.strictEqual(frame.abs_path, path.join(__dirname, 'fixtures', 'src', 'not', 'found.js'))
  t.strictEqual(frame.pre_context, undefined)
  t.strictEqual(frame.context_line, undefined)
  t.strictEqual(frame.post_context, undefined)
}

// ---- tests

test('source map inlined', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-inline.js',
    function onErrorEvent (error) {
      assertSourceFound(t, error)
      t.end()
    }
  )
})

test('source map linked - source code embedded', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-src-embedded.js',
    function onErrorEvent (error) {
      assertSourceFound(t, error)
      t.end()
    }
  )
})

test('source map linked - source code on disk', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error.js',
    function onErrorEvent (error) {
      assertSourceFound(t, error)
      t.end()
    }
  )
})

test('source map linked - source code not found', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-src-missing.js',
    function onErrorEvent (error) {
      assertSourceNotFound(t, error)
      t.end()
    }
  )
})

// ---- broken source map test cases

test('inlined source map broken', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-inline-broken.js',
    function onErrorEvent (error) {
      t.strictEqual(error.exception.message, 'foo', 'got expected exception.message')
      t.strictEqual(error.exception.type, 'Error', 'got expected exception.type')
      t.strictEqual(error.culprit,
        `generateError (${path.join('fixtures', 'lib', 'error-inline-broken.js')})`,
        'got expected culprit')

      var frame = error.exception.stacktrace[0]
      t.strictEqual(frame.filename, path.join('fixtures', 'lib', 'error-inline-broken.js'),
        'got expected top-frame filename')
      t.strictEqual(frame.lineno, 6,
        'got expected top-frame lineno')
      t.strictEqual(frame.function, 'generateError',
        'got expected top-frame function')
      t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1,
        'got expected top-frame library_frame')
      t.strictEqual(frame.abs_path, path.join(__dirname, 'fixtures', 'lib', 'error-inline-broken.js'),
        'got expected top-frame abs_path')
      t.strictEqual(frame.context_line, '  return new Error(msg);',
        'got expected top-frame context_line')

      t.end()
    }
  )
})

test('source map file missing', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-map-missing.js',
    function onErrorEvent (error) {
      t.strictEqual(error.exception.message, 'foo')
      t.strictEqual(error.exception.type, 'Error')
      t.strictEqual(error.culprit, `generateError (${path.join('fixtures', 'lib', 'error-map-missing.js')})`)

      var frame = error.exception.stacktrace[0]
      t.strictEqual(frame.filename, path.join('fixtures', 'lib', 'error-map-missing.js'))
      t.strictEqual(frame.lineno, 6)
      t.strictEqual(frame.function, 'generateError')
      t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1)
      t.strictEqual(frame.abs_path, path.join(__dirname, 'fixtures', 'lib', 'error-map-missing.js'))
      t.strictEqual(frame.context_line, '  return new Error(msg);')

      t.end()
    }
  )
})

test('linked source map broken', function (t) {
  runGivenExportAndGetApmServerErrorEvent(
    t,
    './lib/error-broken.js',
    function onErrorEvent (error) {
      t.strictEqual(error.exception.message, 'foo')
      t.strictEqual(error.exception.type, 'Error')
      t.strictEqual(error.culprit, `generateError (${path.join('fixtures', 'lib', 'error-broken.js')})`)

      var frame = error.exception.stacktrace[0]
      t.strictEqual(frame.filename, path.join('fixtures', 'lib', 'error-broken.js'))
      t.strictEqual(frame.lineno, 6)
      t.strictEqual(frame.function, 'generateError')
      t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1)
      t.strictEqual(frame.abs_path, path.join(__dirname, 'fixtures', 'lib', 'error-broken.js'))
      t.strictEqual(frame.context_line, '  return new Error(msg);')

      t.end()
    }
  )
})
