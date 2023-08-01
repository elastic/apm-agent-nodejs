/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Test lib/errors.js

const path = require('path');

const tape = require('tape');

const logging = require('../lib/logging');
const {
  createAPMError,
  generateErrorId,
  attributesFromErr,
  _moduleNameFromFrames,
} = require('../lib/errors');
const { dottedLookup } = require('./_utils');

const log = logging.createLogger('off');

// Test processing of Error instances by `createAPMError`.
tape.test('#createAPMError({ exception: ... })', function (suite) {
  const defaultOpts = {
    log,
    shouldCaptureAttributes: false,
    timestampUs: 42,
    handled: true,
    sourceLinesAppFrames: 5,
    sourceLinesLibraryFrames: 5,
  };

  const cases = [
    {
      name: 'plain Error object',
      opts: {
        exception: new Error(),
      },
      // We test most of the fields in this first case, and then only bother
      // with "interesting" fields in subsequent cases.
      expectedApmErrorFields: {
        id: /^[0-9a-f]{32}$/,
        timestamp: defaultOpts.timestampUs,
        culprit: `Test.<anonymous> (${path.relative(
          process.cwd(),
          __filename,
        )})`,
        'exception.handled': defaultOpts.handled,
        'exception.message': '',
        'exception.type': 'Error',
        'exception.stacktrace.0.abs_path': __filename,
        'exception.log': undefined,
        'exception.code': undefined,
        'exception.attributes': undefined,
      },
    },
    {
      name: 'Error with message',
      opts: {
        exception: new Error('oops'),
      },
      expectedApmErrorFields: {
        'exception.message': 'oops',
      },
    },
    {
      name: 'TypeError',
      opts: {
        exception: new TypeError('wat'),
      },
      expectedApmErrorFields: {
        'exception.type': 'TypeError',
      },
    },
    {
      name: 'gracefully handle .stack already being accessed',
      opts: {
        exception: (function () {
          const err = new Error('foo');
          suite.equal(typeof err.stack, 'string');
          return err;
        })(),
      },
      expectedApmErrorFields: {
        'exception.message': 'foo',
        'exception.type': 'Error',
        'exception.stacktrace.0.abs_path': __filename,
      },
    },
    {
      name: 'gracefully handle errors whose .stack is overwritten',
      opts: {
        exception: (function () {
          const err = new Error('foo');
          err.stack = 'stack I smite thee';
          return err;
        })(),
      },
      expectedApmErrorFields: {
        'exception.message': 'foo',
        'exception.type': 'Error',
        'exception.stacktrace': [
          {
            filename: '',
            function: 'stack I smite thee',
            lineno: undefined,
            library_frame: true,
            abs_path: '',
          },
        ],
      },
    },
    {
      // This .originalError is a graphql-specific thing.
      name: 'gracefully handle errors with .originalError property',
      opts: {
        exception: (function () {
          function someOtherFunc() {
            return new Error('orig');
          }
          const orig = someOtherFunc();
          const err = new Error('error with originalError');
          err.stack = 'stack I smite thee again';
          err.originalError = orig;
          return err;
        })(),
      },
      expectedApmErrorFields: {
        culprit: `someOtherFunc (${path.relative(process.cwd(), __filename)})`,
        'exception.message': 'error with originalError',
        'exception.stacktrace.0.abs_path': __filename,
        'exception.stacktrace.0.function': 'someOtherFunc',
      },
    },
    {
      name: 'captureAttributes=true',
      opts: {
        shouldCaptureAttributes: true,
        exception: (function () {
          const err = new Error('boom');
          err.aProp = 'this is my property';
          return err;
        })(),
      },
      expectedApmErrorFields: {
        'exception.attributes.aProp': 'this is my property',
      },
    },
    {
      name: 'captureAttributes=false',
      opts: {
        shouldCaptureAttributes: false,
        exception: (function () {
          const err = new Error('boom');
          err.aProp = 'this is my property';
          return err;
        })(),
      },
      expectedApmErrorFields: {
        'exception.attributes': undefined,
      },
    },
    {
      name: 'sourceLinesError*Frames=0 means no context fields in frames',
      opts: {
        exception: new Error(),
        sourceLinesAppFrames: 0,
        sourceLinesLibraryFrames: 0,
      },
      expectedApmErrorFields: {
        'exception.stacktrace.0.abs_path': __filename,
        'exception.stacktrace.0.pre_context': undefined,
        'exception.stacktrace.0.context_line': undefined,
        'exception.stacktrace.0.post_context': undefined,
      },
    },
  ];

  cases.forEach((c) => {
    suite.test(c.name, function (t) {
      createAPMError(
        Object.assign({}, defaultOpts, { id: generateErrorId() }, c.opts),
        function (_, apmError) {
          // Test each of the exceptations in c.expectedApmErrorFields.
          Object.keys(c.expectedApmErrorFields).forEach((field) => {
            const expected = c.expectedApmErrorFields[field];
            const actual = dottedLookup(apmError, field);
            if (expected instanceof RegExp) {
              t.ok(
                expected.test(actual),
                `apmError.${field} matches ${expected}: ${actual}`,
              );
            } else {
              t.deepEqual(
                actual,
                expected,
                `apmError.${field} equals ${JSON.stringify(expected)}`,
              );
            }
          });
          t.end();
        },
      );
    });
  });

  suite.end();
});

// Test the various forms of the `logMessage` arg to `createAPMError`.
tape.test('#createAPMError({ logMessage: ... })', function (suite) {
  const cases = [
    {
      name: 'string',
      logMessage: 'Howdy',
      expectedErrLog: { message: 'Howdy' },
    },
    {
      name: 'object',
      logMessage: { message: 'foo%s', params: ['bar'] },
      expectedErrLog: { message: 'foobar', param_message: 'foo%s' },
    },
    {
      name: 'invalid object',
      logMessage: { foo: /bar/ },
      expectedErrLog: { message: '{ foo: /bar/ }' },
    },
    {
      name: 'null',
      logMessage: null,
      expectedErrLog: { message: 'null' },
    },
  ];

  cases.forEach((c) => {
    suite.test(`logMessage: ${JSON.stringify(c.logMessage)}`, function (t) {
      createAPMError(
        {
          log,
          id: generateErrorId(),
          shouldCaptureAttributes: false,
          timestampUs: 42,
          handled: true,
          sourceLinesAppFrames: 0,
          sourceLinesLibraryFrames: 0,
          logMessage: c.logMessage,
        },
        function (_, apmError) {
          t.deepEqual(
            apmError.log,
            c.expectedErrLog,
            'apmError.log is as expected',
          );
          t.end();
        },
      );
    });
  });

  suite.end();
});

tape.test('#_moduleNameFromFrames()', function (suite) {
  var cases = [
    {
      name: 'unnamespaced package',
      frames: [
        {
          library_frame: true,
          filename: 'node_modules/tape/lib/test.js',
          // Typical fields in a frame, but not used by _moduleNameFromFrames:
          //  abs_path: '/home/bob/src/myproj/node_modules/tape/lib/test.js'
          //  function: 'bound'
          //  lineno: 84
          //  pre_context: ...
          //  context_line: ...
          //  post_context: ...
        },
        // More frames... Only top frame is used by _moduleNameFromFrames.
      ],
      expected: 'tape',
    },
    {
      name: 'namespaced package',
      frames: [
        {
          library_frame: true,
          filename: 'node_modules/@elastic/elasticsearch/lib/config.js',
          // Typical fields in a frame, but not used by _moduleNameFromFrames:
          //  abs_path: '/home/bob/src/myproj/node_modules/tape/lib/test.js'
          //  function: 'bound'
          //  lineno: 84
          //  pre_context: ...
          //  context_line: ...
          //  post_context: ...
        },
        // More frames... Only top frame is used by _moduleNameFromFrames.
      ],
      expected: '@elastic/elasticsearch',
    },
    {
      name: 'deep package',
      frames: [
        {
          library_frame: true,
          filename: 'node_modules/foo/node_modules/bar/lib/baz.js',
        },
        // More frames... Only top frame is used by _moduleNameFromFrames.
      ],
      expected: 'bar',
    },
    {
      name: 'namespaced package missing name',
      frames: [
        {
          library_frame: true,
          filename: 'node_modules/@ns/',
        },
        // More frames... Only top frame is used by _moduleNameFromFrames.
      ],
      expected: null,
    },
    {
      name: 'empty frames',
      frames: [],
      expected: null,
    },
    {
      name: 'not library_frame',
      frames: [
        {
          library_frame: false,
          filename: 'node:_http_common',
        },
      ],
      expected: null,
    },
    {
      name: 'frame in node lib',
      frames: [
        {
          filename: 'timers.js',
          lineno: 658,
          function: 'processImmediate',
          library_frame: true,
          abs_path: 'timers.js',
        },
      ],
      expected: null,
    },
  ];

  cases.forEach(function (opts) {
    suite.test(opts.name || '[anonymous test case]', function (t) {
      // Normalize top frame path if running on Windows. The
      // _moduleNameFromFrames implementation adapts to path.sep.
      if (path.sep === '\\' && opts.frames.length > 0) {
        opts.frames[0].filename = opts.frames[0].filename.replace(/\//g, '\\');
      }

      t.strictEqual(
        _moduleNameFromFrames(opts.frames),
        opts.expected,
        'got ' + opts.expected,
      );
      t.end();
    });
  });

  suite.end();
});

tape.test('#attributesFromErr()', function (suite) {
  var cases = [
    // 'err' is an Error instance, or a function that returns one.
    {
      name: 'no attrs',
      err: new Error('boom'),
      expectedAttrs: undefined,
    },
    {
      name: 'string attr',
      err: () => {
        const err = new Error('boom');
        err.aStr = 'hello';
        return err;
      },
      expectedAttrs: { aStr: 'hello' },
    },
    {
      name: 'Invalid Date attr',
      err: () => {
        const err = new Error('boom');
        err.aDate = new Date('invalid');
        return err;
      },
      expectedAttrs: { aDate: 'Invalid Date' },
    },
  ];

  cases.forEach(function (opts) {
    suite.test(opts.name, function (t) {
      const err = typeof opts.err === 'function' ? opts.err() : opts.err;
      const attrs = attributesFromErr(err);
      t.deepEqual(attrs, opts.expectedAttrs, 'got expected attrs');
      t.end();
    });
  });

  suite.end();
});
