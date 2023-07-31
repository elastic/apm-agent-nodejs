/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var path = require('path');

var test = require('tape');

var agent = require('../../').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  logLevel: 'fatal',
});

test('source map inlined', function (t) {
  onError(t, assertSourceFound);
  agent.captureError(require('./fixtures/lib/error-inline')());
});

test('source map linked', function (t) {
  t.test('source mapped source code embedded', function (t) {
    onError(t, assertSourceFound);
    agent.captureError(require('./fixtures/lib/error-src-embedded')());
  });

  t.test('source mapped source code on disk', function (t) {
    onError(t, assertSourceFound);
    agent.captureError(require('./fixtures/lib/error')());
  });

  t.test('source mapped source code not found', function (t) {
    onError(t, assertSourceNotFound);
    agent.captureError(require('./fixtures/lib/error-src-missing')());
  });
});

test('fails', function (t) {
  t.test('inlined source map broken', function (t) {
    onError(t, function (t, error) {
      t.strictEqual(error.exception.message, 'foo');
      t.strictEqual(error.exception.type, 'Error');
      t.strictEqual(
        error.culprit,
        `generateError (${path.join(
          'test',
          'sourcemaps',
          'fixtures',
          'lib',
          'error-inline-broken.js',
        )})`,
      );

      var frame = error.exception.stacktrace[0];
      t.strictEqual(
        frame.filename,
        path.join(
          'test',
          'sourcemaps',
          'fixtures',
          'lib',
          'error-inline-broken.js',
        ),
      );
      t.strictEqual(frame.lineno, 6);
      t.strictEqual(frame.function, 'generateError');
      t.strictEqual(
        frame.library_frame,
        __dirname.indexOf('node_modules') !== -1,
      );
      t.strictEqual(
        frame.abs_path,
        path.join(__dirname, 'fixtures', 'lib', 'error-inline-broken.js'),
      );
      t.strictEqual(frame.context_line, '  return new Error(msg);');
    });
    agent.captureError(require('./fixtures/lib/error-inline-broken')());
  });

  t.test('linked source map not found', function (t) {
    onError(t, function (t, error) {
      t.strictEqual(error.exception.message, 'foo');
      t.strictEqual(error.exception.type, 'Error');
      t.strictEqual(
        error.culprit,
        `generateError (${path.join(
          'test',
          'sourcemaps',
          'fixtures',
          'lib',
          'error-map-missing.js',
        )})`,
      );

      var frame = error.exception.stacktrace[0];
      t.strictEqual(
        frame.filename,
        path.join(
          'test',
          'sourcemaps',
          'fixtures',
          'lib',
          'error-map-missing.js',
        ),
      );
      t.strictEqual(frame.lineno, 6);
      t.strictEqual(frame.function, 'generateError');
      t.strictEqual(
        frame.library_frame,
        __dirname.indexOf('node_modules') !== -1,
      );
      t.strictEqual(
        frame.abs_path,
        path.join(__dirname, 'fixtures', 'lib', 'error-map-missing.js'),
      );
      t.strictEqual(frame.context_line, '  return new Error(msg);');
    });
    agent.captureError(require('./fixtures/lib/error-map-missing')());
  });

  t.test('linked source map broken', function (t) {
    onError(t, function (t, error) {
      t.strictEqual(error.exception.message, 'foo');
      t.strictEqual(error.exception.type, 'Error');
      t.strictEqual(
        error.culprit,
        `generateError (${path.join(
          'test',
          'sourcemaps',
          'fixtures',
          'lib',
          'error-broken.js',
        )})`,
      );

      var frame = error.exception.stacktrace[0];
      t.strictEqual(
        frame.filename,
        path.join('test', 'sourcemaps', 'fixtures', 'lib', 'error-broken.js'),
      );
      t.strictEqual(frame.lineno, 6);
      t.strictEqual(frame.function, 'generateError');
      t.strictEqual(
        frame.library_frame,
        __dirname.indexOf('node_modules') !== -1,
      );
      t.strictEqual(
        frame.abs_path,
        path.join(__dirname, 'fixtures', 'lib', 'error-broken.js'),
      );
      t.strictEqual(frame.context_line, '  return new Error(msg);');
    });
    agent.captureError(require('./fixtures/lib/error-broken')());
  });
});

function onError(t, assert) {
  agent._apmClient = {
    flush() {},
    sendTransaction() {},
    sendSpan() {},
    sendMetricSet() {},
    sendError(error, cb) {
      assert(t, error);
      t.end();
    },
  };
}

function assertSourceFound(t, error) {
  t.strictEqual(error.exception.message, 'foo');
  t.strictEqual(error.exception.type, 'Error');
  t.strictEqual(
    error.culprit,
    `generateError (${path.join(
      'test',
      'sourcemaps',
      'fixtures',
      'src',
      'error.js',
    )})`,
  );

  var frame = error.exception.stacktrace[0];
  t.strictEqual(
    frame.filename,
    path.join('test', 'sourcemaps', 'fixtures', 'src', 'error.js'),
  );
  t.strictEqual(frame.lineno, 2);
  t.strictEqual(frame.function, 'generateError');
  t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1);
  t.strictEqual(
    frame.abs_path,
    path.join(__dirname, 'fixtures', 'src', 'error.js'),
  );
  t.deepEqual(frame.pre_context, ['// Just a little prefixing line']);
  t.strictEqual(
    frame.context_line,
    "const generateError = (msg = 'foo') => new Error(msg)",
  );
  t.deepEqual(frame.post_context, ['', 'module.exports = generateError']);
}

function assertSourceNotFound(t, error) {
  t.strictEqual(error.exception.message, 'foo');
  t.strictEqual(error.exception.type, 'Error');
  t.strictEqual(
    error.culprit,
    `generateError (${path.join(
      'test',
      'sourcemaps',
      'fixtures',
      'src',
      'not',
      'found.js',
    )})`,
  );

  var frame = error.exception.stacktrace[0];
  t.strictEqual(
    frame.filename,
    path.join('test', 'sourcemaps', 'fixtures', 'src', 'not', 'found.js'),
  );
  t.strictEqual(frame.lineno, 2);
  t.strictEqual(frame.function, 'generateError');
  t.strictEqual(frame.library_frame, __dirname.indexOf('node_modules') !== -1);
  t.strictEqual(
    frame.abs_path,
    path.join(__dirname, 'fixtures', 'src', 'not', 'found.js'),
  );
  t.strictEqual(frame.pre_context, undefined);
  t.strictEqual(frame.context_line, undefined);
  t.strictEqual(frame.post_context, undefined);
}
