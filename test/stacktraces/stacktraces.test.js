/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test the various ways a 'stacktrace' can be captured and reported to APM
// server.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const tape = require('tape');

const logging = require('../../lib/logging');
const { MockAPMServer } = require('../_mock_apm_server');
const {
  gatherStackTrace,
  initStackTraceCollection,
  stackTraceFromErrStackString,
} = require('../../lib/stacktraces');

const log = logging.createLogger('off');

// Execute 'node fixtures/throw-an-error.js' and assert APM server gets the
// error.exception.stacktrace we expect.
tape.test('error.exception.stacktrace', function (t) {
  const server = new MockAPMServer();
  server.start(function (serverUrl) {
    execFile(
      process.execPath,
      ['fixtures/throw-an-error.js'],
      {
        cwd: __dirname,
        timeout: 10000, // sanity stop, 3s is sometimes too short for CI
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl,
        }),
      },
      function done(err, _stdout, _stderr) {
        t.ok(err, 'throw-an-error.js errored out');
        t.ok(
          /Error: boom/.test(err.message),
          'err.message includes /Error: boom/: ' + JSON.stringify(err.message),
        );
        t.ok(server.events[0].metadata, 'APM server got event metadata object');
        t.ok(server.events[1].error, 'APM server got error event');
        const stacktrace = server.events[1].error.exception.stacktrace;
        t.deepEqual(
          stacktrace[0],
          {
            filename: path.join('fixtures', 'throw-an-error.js'),
            lineno: 21,
            function: 'main',
            library_frame: false,
            abs_path: path.join(__dirname, 'fixtures', 'throw-an-error.js'),
            pre_context: ['', 'function main() {'],
            context_line: "  throw new Error('boom');",
            post_context: ['}', ''],
          },
          'stacktrace top frame is as expected',
        );
        server.close();
        t.end();
      },
    );
  });
});

// There was a bug in stacktrace frame caching when a stacktrace had duplicate
// frames: the JSON serialization protection against circular references would
// accidentally replace duplicate frames with `["Circular"]`.
tape.test(
  'error.exception.stacktrace does not have "[Circular]" frames',
  function (t) {
    const server = new MockAPMServer();
    server.start(function (serverUrl) {
      execFile(
        process.execPath,
        ['fixtures/circular-stack.js'],
        {
          cwd: __dirname,
          timeout: 10000, // sanity stop, 3s is sometimes too short for CI
          env: Object.assign({}, process.env, {
            ELASTIC_APM_SERVER_URL: serverUrl,
          }),
        },
        function done(err, _stdout, _stderr) {
          t.error(err, 'circular-stack.js exited non-zero');
          t.ok(
            server.events[0].metadata,
            'APM server got first metadata object',
          );
          t.ok(server.events[1].error, 'APM server got first error event');
          t.ok(
            server.events[2].metadata,
            'APM server got second metadata object',
          );
          t.ok(server.events[3].error, 'APM server got second error event');
          // The script calls `boomOnZero(10)`, so we expect to see *9* frames at the
          // `boomOnZero(n)` line.
          let count = 0;
          const stacktrace = server.events[3].error.exception.stacktrace;
          stacktrace.forEach(function (frame) {
            if (frame.context_line === '    boomOnZero(n);') {
              count++;
              t.deepEqual(
                frame,
                {
                  filename: path.join('fixtures', 'circular-stack.js'),
                  lineno: 25,
                  function: 'boomOnZero',
                  library_frame: false,
                  abs_path: path.join(
                    __dirname,
                    'fixtures',
                    'circular-stack.js',
                  ),
                  pre_context: [
                    "    throw new Error('boom on zero');",
                    '  } else {',
                  ],
                  context_line: '    boomOnZero(n);',
                  post_context: ['  }', '}'],
                },
                '"boom on zero" stacktrace frame is as expected',
              );
            }
          });
          t.equal(count, 9, 'found 9 "boom on zero" stacktrace frames');
          server.close();
          t.end();
        },
      );
    });
  },
);

tape.test('error.log.stacktrace', function (t) {
  const server = new MockAPMServer();
  server.start(function (serverUrl) {
    execFile(
      process.execPath,
      ['fixtures/capture-error-string.js'],
      {
        cwd: __dirname,
        timeout: 3000,
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl,
        }),
      },
      function done(err, _stdout, _stderr) {
        t.error(err, 'capture-error-string.js did not error');
        t.ok(server.events[0].metadata, 'APM server got event metadata object');
        t.deepEqual(
          server.events[1].error.log.stacktrace[0],
          {
            filename: path.join('fixtures', 'capture-error-string.js'),
            lineno: 21,
            function: 'main',
            library_frame: false,
            abs_path: path.join(
              __dirname,
              'fixtures',
              'capture-error-string.js',
            ),
            pre_context: ['', 'function main() {'],
            context_line: "  agent.captureError('a string error message');",
            post_context: [
              "  agent.captureError({ message: 'message template: %d', params: [42] });",
              '}',
            ],
          },
          'first error.log.stacktrace top frame is as expected',
        );
        t.deepEqual(
          server.events[2].error.log.stacktrace[0],
          {
            filename: path.join('fixtures', 'capture-error-string.js'),
            lineno: 22,
            function: 'main',
            library_frame: false,
            abs_path: path.join(
              __dirname,
              'fixtures',
              'capture-error-string.js',
            ),
            pre_context: [
              'function main() {',
              "  agent.captureError('a string error message');",
            ],
            context_line:
              "  agent.captureError({ message: 'message template: %d', params: [42] });",
            post_context: ['}', ''],
          },
          'second error.log.stacktrace top frame is as expected',
        );
        server.close();
        t.end();
      },
    );
  });
});

tape.test('span.stacktrace', function (t) {
  const server = new MockAPMServer();
  const testScript = path.join('fixtures', 'send-a-span.js');
  server.start(function (serverUrl) {
    execFile(
      process.execPath,
      [testScript],
      {
        cwd: __dirname,
        timeout: 3000,
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl,
        }),
      },
      function done(err, _stdout, _stderr) {
        t.error(err, 'send-a-span.js did not error');
        t.ok(server.events[0].metadata, 'APM server got event metadata object');
        const span = server.events.filter((e) => e.span)[0].span;
        t.ok(span, 'APM server got span event');
        t.ok(span.stacktrace, 'span has a stacktrace');
        // Some top frames will be in the agent code. Normally these are
        // filtered out, but that depends on an agent installed in
        // ".../node_modules/elastic-apm-node/...", which isn't the case under
        // test.
        const firstAppFrame = span.stacktrace.filter(
          (f) => f.filename === testScript,
        )[0];
        t.deepEqual(
          firstAppFrame,
          {
            filename: testScript,
            lineno: 27,
            function: 'main',
            library_frame: false,
            abs_path: path.join(__dirname, 'fixtures', 'send-a-span.js'),
            pre_context: [
              'function main() {',
              "  const trans = agent.startTransaction('main');",
            ],
            context_line: "  const span = agent.startSpan('a');",
            post_context: ['  a(function () {', '    span.end();'],
          },
          'first app frame in stacktrace is as expected',
        );
        server.close();
        t.end();
      },
    );
  });
});

// Test that the stacktrace from a file with a sourcemap works:
// 1. 'filename', 'lineno', 'abs_path' point to the mapped file (in this
//    case the source TypeScript file)
// 2. '*context*' fields load the "sourcesContent" from the sourcemap. We
//    force this by building the sourcemap with a bogus "no-such-dir"
//    "sourceRoot" (see the setting in fixtures/tsconfig.json).
//
// Note: Other sourcemap tests are in "test/sourcemaps/". That set currently
// lacks a test that "sourcesContent" works -- which is one of the things tested
// by this case.
tape.test('error.exception.stacktrace with sourcemap', function (t) {
  const server = new MockAPMServer();
  server.start(function (serverUrl) {
    execFile(
      process.execPath,
      ['fixtures/dist/throw-an-error-with-sourcemap.js'],
      {
        cwd: __dirname,
        timeout: 3000,
        env: Object.assign({}, process.env, {
          ELASTIC_APM_SERVER_URL: serverUrl,
        }),
      },
      function done(err, _stdout, _stderr) {
        t.ok(err, 'throw-an-error-with-sourcemap.js errored out');
        t.ok(
          /Error: boom/.test(err.message),
          'err.message includes /Error: boom/: ' + JSON.stringify(err.message),
        );
        t.ok(server.events[0].metadata, 'APM server got event metadata object');
        t.ok(server.events[1].error, 'APM server got error event');
        const stacktrace = server.events[1].error.exception.stacktrace;
        t.deepEqual(
          stacktrace[0],
          {
            filename: path.join(
              'fixtures',
              'dist',
              'no-such-dir',
              'throw-an-error-with-sourcemap.ts',
            ),
            lineno: 22,
            function: 'main',
            library_frame: false,
            abs_path: path.join(
              __dirname,
              'fixtures',
              'dist',
              'no-such-dir',
              'throw-an-error-with-sourcemap.ts',
            ),
            pre_context: ['', 'function main(msg: string) {'],
            context_line: '  throw new Error(msg)',
            post_context: ['}', ''],
          },
          'stacktrace top frame is as expected',
        );
        server.close();
        t.end();
      },
    );
  });
});

tape.test('stackTraceFromErrStackString()', function (t) {
  function theFunction() {
    return new Error('here I am'); // <-- the top frame will point here
  }

  // To avoid the "lineno" test below failing frequently whenever this file is
  // edited, we read this file to get the current line number of the
  // `new Error('...')` line above.
  const lines = fs.readFileSync(__filename, { encoding: 'utf8' }).split(/\n/g);
  let lineno = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*return new Error\('here I am'\)/.test(lines[i])) {
      lineno = i + 1;
      break;
    }
  }

  const stacktrace = stackTraceFromErrStackString(log, theFunction());
  t.ok(stacktrace, 'got a stacktrace');
  t.ok(Array.isArray(stacktrace), 'stacktrace is an Array');
  t.deepEqual(
    stacktrace[0],
    {
      filename: path.relative(process.cwd(), __filename),
      function: 'theFunction',
      lineno,
      library_frame: false,
      abs_path: __filename,
    },
    'stacktrace top frame is as expected',
  );

  t.end();
});

tape.test('gatherStackTrace()', function (suite) {
  initStackTraceCollection();
  function thisIsMyFunction() {
    // before 2
    // before 1
    return new Error('sha-boom');
    // after 1
    // after 2
  }

  // To avoid the "lineno" test below failing frequently whenever this file is
  // edited, we read this file to get the current line number of the
  // `new Error('...')` line above.
  const lines = fs.readFileSync(__filename, { encoding: 'utf8' }).split(/\n/g);
  let lineno = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*return new Error\('sha-boom'\)/.test(lines[i])) {
      lineno = i + 1;
      break;
    }
  }

  var cases = [
    {
      lines: 0,
      expectedContext: {},
    },
    {
      lines: 1,
      expectedContext: {
        pre_context: [],
        context_line: "    return new Error('sha-boom');",
        post_context: [],
      },
    },
    {
      lines: 2,
      expectedContext: {
        pre_context: ['    // before 1'],
        context_line: "    return new Error('sha-boom');",
        post_context: [],
      },
    },
    {
      lines: 3,
      expectedContext: {
        pre_context: ['    // before 1'],
        context_line: "    return new Error('sha-boom');",
        post_context: ['    // after 1'],
      },
    },
    {
      lines: 4,
      expectedContext: {
        pre_context: ['    // before 2', '    // before 1'],
        context_line: "    return new Error('sha-boom');",
        post_context: ['    // after 1'],
      },
    },
    {
      lines: 5,
      expectedContext: {
        pre_context: ['    // before 2', '    // before 1'],
        context_line: "    return new Error('sha-boom');",
        post_context: ['    // after 1', '    // after 2'],
      },
    },
  ];

  cases.forEach((c) => {
    suite.test(`${c.lines} lines of source context`, (t) => {
      const err = thisIsMyFunction();
      gatherStackTrace(
        log,
        err,
        c.lines,
        c.lines,
        null,
        function (_, stacktrace) {
          const expectedTopFrame = {
            filename: path.relative(process.cwd(), __filename),
            lineno,
            function: 'thisIsMyFunction',
            library_frame: false,
            abs_path: __filename,
            ...c.expectedContext,
          };
          t.deepEqual(
            stacktrace[0],
            expectedTopFrame,
            'top frame is as expected',
          );
          t.end();
        },
      );
    });
  });

  tape.test('Error.prepareStackTrace is set', function (t) {
    const server = new MockAPMServer();
    server.start(function (serverUrl) {
      execFile(
        process.execPath,
        ['fixtures/get-prepare-stacktrace.js'],
        {
          cwd: __dirname,
          timeout: 3000,
          env: Object.assign({}, process.env, {
            ELASTIC_APM_ACTIVE: true,
          }),
        },
        function done(err, _stdout, _stderr) {
          t.ok(!err);
          t.equals(
            _stdout.trim(),
            'csPrepareStackTrace',
            'Error.prepareStackTrace is set',
          );
          server.close();
          t.end();
        },
      );
    });
  });

  tape.test('Error.prepareStackTrace is not set', function (t) {
    const server = new MockAPMServer();
    server.start(function (serverUrl) {
      execFile(
        process.execPath,
        ['fixtures/get-prepare-stacktrace.js'],
        {
          cwd: __dirname,
          timeout: 3000,
          env: Object.assign({}, process.env, {
            ELASTIC_APM_ACTIVE: false,
          }),
        },
        function done(err, _stdout, _stderr) {
          t.ok(!err);
          t.equals(
            _stdout.trim(),
            'undefined',
            'Error.prepareStackTrace is not set',
          );
          server.close();
          t.end();
        },
      );
    });
  });

  suite.end();
});
