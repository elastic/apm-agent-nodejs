'use strict'

// Test the various ways a 'stacktrace' can be captured and reported to APM
// server.

const { exec } = require('child_process')
const path = require('path')
const tape = require('tape')

const { MockAPMServer } = require('./_mock_apm_server')

// Execute 'node fixtures/throw-an-error.js' and assert APM server gets the
// error.exception.stacktrace we expect.
tape.test('error.exception.stacktrace', function (t) {
  const server = new MockAPMServer()
  server.start(function (serverUrl) {
    exec(
      `${process.execPath} fixtures/throw-an-error.js`,
      {
        cwd: __dirname,
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: serverUrl
        }
      },
      function done (err, _stdout, _stderr) {
        t.ok(err, 'throw-an-error.js errored out')
        t.ok(server.events[0].metadata, 'APM server got event metadata object')
        t.ok(server.events[1].error, 'APM server got error event')
        const stacktrace = server.events[1].error.exception.stacktrace
        t.deepEqual(
          stacktrace[0],
          {
            filename: path.join('fixtures', 'throw-an-error.js'),
            lineno: 15,
            function: 'main',
            library_frame: false,
            abs_path: path.join(process.cwd(), 'fixtures', 'throw-an-error.js'),
            pre_context: ['', 'function main () {'],
            context_line: "  throw new Error('boom')",
            post_context: ['}', '']
          },
          'stacktrace top frame is as expected'
        )
        server.close()
        t.end()
      }
    )
  })
})

tape.test('error.log.stacktrace', function (t) {
  const server = new MockAPMServer()
  server.start(function (serverUrl) {
    exec(
      `${process.execPath} fixtures/capture-error-string.js`,
      {
        cwd: __dirname,
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: serverUrl
        }
      },
      function done (err, _stdout, _stderr) {
        t.error(err, 'capture-error-string.js did not error')
        t.ok(server.events[0].metadata, 'APM server got event metadata object')
        t.deepEqual(
          server.events[1].error.log.stacktrace[0],
          {
            filename: path.join('fixtures', 'capture-error-string.js'),
            lineno: 15,
            function: 'main',
            library_frame: false,
            abs_path: path.join(process.cwd(), 'fixtures', 'capture-error-string.js'),
            pre_context: ['', 'function main () {'],
            context_line: '  agent.captureError(\'a string error message\')',
            post_context: ['  agent.captureError({ message: \'message template: %d\', params: [42] })', '}']
          },
          'first error.log.stacktrace top frame is as expected'
        )
        t.deepEqual(
          server.events[2].error.log.stacktrace[0],
          {
            filename: path.join('fixtures', 'capture-error-string.js'),
            lineno: 16,
            function: 'main',
            library_frame: false,
            abs_path: path.join(process.cwd(), 'fixtures', 'capture-error-string.js'),
            pre_context: ['function main () {', '  agent.captureError(\'a string error message\')'],
            context_line: '  agent.captureError({ message: \'message template: %d\', params: [42] })',
            post_context: ['}', '']
          },
          'second error.log.stacktrace top frame is as expected'
        )
        server.close()
        t.end()
      }
    )
  })
})

tape.test('span.stacktrace', function (t) {
  const server = new MockAPMServer()
  const testScript = path.join('fixtures', 'send-a-span.js')
  server.start(function (serverUrl) {
    exec(
      `${process.execPath} ${testScript}`,
      {
        cwd: __dirname,
        timeout: 3000,
        env: {
          ELASTIC_APM_SERVER_URL: serverUrl
        }
      },
      function done (err, _stdout, _stderr) {
        t.error(err, 'send-a-span.js did not error')
        t.ok(server.events[0].metadata, 'APM server got event metadata object')
        const span = server.events.filter(e => e.span)[0].span
        t.ok(span, 'APM server got span event')
        t.ok(span.stacktrace, 'span has a stacktrace')
        // Some top frames will be in the agent code. Normally these are
        // filtered out, but that depends on an agent installed in
        // ".../node_modules/elastic-apm-node/...", which isn't the case under
        // test.
        const firstAppFrame = span.stacktrace
          .filter(f => f.filename === testScript)[0]
        t.deepEqual(
          firstAppFrame,
          {
            filename: testScript,
            lineno: 23,
            function: 'main',
            library_frame: false,
            abs_path: path.join(process.cwd(), 'fixtures', 'send-a-span.js'),
            pre_context: [
              'function main () {',
              "  const trans = agent.startTransaction('main')"
            ],
            context_line: "  const span = agent.startSpan('a')",
            post_context: ['  a(function () {', '    span.end()']
          },
          'first app frame in stacktrace is as expected'
        )
        server.close()
        t.end()
      }
    )
  })
})

// tape.test('error.exception.stacktrace with sourcemap', function (t) {
//   const server = new MockAPMServer()
//   server.start(function (serverUrl) {
//     exec(
//       `${process.execPath} fixtures/throw-an-error.js`,
//       {
//         cwd: __dirname,
//         timeout: 3000,
//         env: {
//           ELASTIC_APM_SERVER_URL: serverUrl
//         }
//       },
//       function done (err, _stdout, _stderr) {
//         t.ok(err, 'throw-an-error.js errored out')
//         t.ok(server.events[0].metadata, 'APM server got event metadata object')
//         t.ok(server.events[1].error, 'APM server got error event')
//         const stacktrace = server.events[1].error.exception.stacktrace
//         t.deepEqual(
//           stacktrace[0],
//           {
//             filename: path.join('fixtures', 'throw-an-error.js'),
//             lineno: 15,
//             function: 'main',
//             library_frame: false,
//             abs_path: path.join(process.cwd(), 'fixtures', 'throw-an-error.js'),
//             pre_context: ['', 'function main () {'],
//             context_line: "  throw new Error('boom')",
//             post_context: ['}', '']
//           },
//           'stacktrace top frame is as expected'
//         )
//         server.close()
//         t.end()
//       }
//     )
//   })
// })
