/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var path = require('path');
var Agent = require('../lib/agent');
var agent = new Agent();
agent._config({});

exports.stacktrace = function (
  t,
  topFunctionName,
  topAbsPath,
  stacktrace,
  _agent,
  isError,
) {
  t.ok(Array.isArray(stacktrace), 'stacktrace should be an array');
  t.ok(stacktrace.length > 0, 'stacktrace should have at least one frame');
  t.strictEqual(
    stacktrace[0].function,
    topFunctionName,
    'top frame should have expected function',
  );
  t.strictEqual(
    stacktrace[0].abs_path,
    topAbsPath,
    'top frame should have expected abs_path',
  );

  stacktrace.forEach(stackFrameValidator(t, _agent || agent, isError));
};

function stackFrameValidator(t, agent, isError) {
  var conf = agent._conf;
  return function (frame) {
    var nodeCore = !path.isAbsolute(frame.abs_path);

    var lines = isError
      ? frame.library_frame
        ? conf.sourceLinesErrorLibraryFrames
        : conf.sourceLinesErrorAppFrames
      : frame.library_frame
      ? conf.sourceLinesSpanLibraryFrames
      : conf.sourceLinesSpanAppFrames;

    var shouldHaveSource = !nodeCore && lines !== 0;

    var expectedKeys = shouldHaveSource
      ? [
          'filename',
          'lineno',
          'function',
          'library_frame',
          'abs_path',
          'pre_context',
          'context_line',
          'post_context',
        ]
      : ['filename', 'lineno', 'function', 'library_frame', 'abs_path'];
    t.deepEqual(
      Object.keys(frame),
      expectedKeys,
      'frame should have expected properties',
    );

    t.strictEqual(
      typeof frame.filename,
      'string',
      'frame.filename should be a string',
    );
    t.ok(frame.lineno > 0, 'frame.lineno should be greater than 0');
    t.strictEqual(
      typeof frame.function,
      'string',
      'frame.function should be a string',
    );
    t.strictEqual(
      typeof frame.library_frame,
      'boolean',
      'frame.library_frame should be a boolean',
    );
    t.strictEqual(
      typeof frame.abs_path,
      'string',
      'frame.abs_path should be a string',
    );

    if (shouldHaveSource) {
      t.ok(
        Array.isArray(frame.pre_context),
        'frame.pre_context should be an array',
      );
      t.strictEqual(
        frame.pre_context.length,
        2,
        'frame.pre_context should have two elements',
      );
      t.strictEqual(
        typeof frame.context_line,
        'string',
        'frame.context_line should be a string',
      );
      t.ok(
        frame.context_line.length > 0,
        'frame.context_line should consist of at least one character',
      );
      t.ok(
        Array.isArray(frame.post_context),
        'frame.post_context should be an array',
      );
      t.strictEqual(
        frame.post_context.length,
        2,
        'frame.post_context should have two elements',
      );
    }
  };
}
