'use strict'

exports.stacktrace = function (t, topFunctionName, topAbsPath, stacktrace) {
  t.ok(Array.isArray(stacktrace), 'stacktrace should be an array')
  t.ok(stacktrace.length > 0, 'stacktrace should have at least one frame')
  t.equal(stacktrace[0].function, topFunctionName, 'top frame should have expected function')
  t.equal(stacktrace[0].abs_path, topAbsPath, 'top frame should have expected abs_path')

  stacktrace.forEach(stackFrameValidator(t))
}

function stackFrameValidator (t) {
  return function (frame) {
    var nodeCore = frame.abs_path.indexOf('/') === -1
    var shouldHaveSource = !nodeCore && frame.in_app

    // FIXME: Remove when CI passes
    if (shouldHaveSource && !frame.context_line) {
      console.log(frame)
    }

    var expectedKeys = shouldHaveSource
      ? ['filename', 'lineno', 'function', 'in_app', 'abs_path', 'pre_context', 'context_line', 'post_context']
      : ['filename', 'lineno', 'function', 'in_app', 'abs_path']
    t.deepEqual(Object.keys(frame), expectedKeys, 'frame should have expected properties')

    t.equal(typeof frame.filename, 'string', 'frame.filename should be a string')
    t.ok(frame.lineno > 0, 'frame.lineno should be greater than 0')
    t.equal(typeof frame.function, 'string', 'frame.function should be a string')
    t.equal(typeof frame.in_app, 'boolean', 'frame.in_app should be a boolean')
    t.equal(typeof frame.abs_path, 'string', 'frame.abs_path should be a string')

    if (shouldHaveSource) {
      t.ok(Array.isArray(frame.pre_context), 'frame.pre_context should be an array')
      t.equal(frame.pre_context.length, 2, 'frame.pre_context should have two elements')
      t.equal(typeof frame.context_line, 'string', 'frame.context_line should be a string')
      t.ok(frame.context_line.length > 0, 'frame.context_line should consist of at least one character')
      t.ok(Array.isArray(frame.post_context), 'frame.post_context should be an array')
      t.equal(frame.post_context.length, 2, 'frame.post_context should have two elements')
    }
  }
}
