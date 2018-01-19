'use strict'

exports.stacktrace = function (t, topFunctionName, topAbsPath, stacktrace) {
  t.ok(Array.isArray(stacktrace))
  t.ok(stacktrace.length > 0)
  t.equal(stacktrace[0].function, topFunctionName)
  t.equal(stacktrace[0].abs_path, topAbsPath)

  stacktrace.forEach(stackFrameValidator(t))
}

function stackFrameValidator (t) {
  return function (frame) {
    var nodeCore = !/\//.test(frame.abs_path)
    var shouldHaveSource = !nodeCore

    // FIXME: Remove when CI passes
    if (shouldHaveSource && !frame.context_line) {
      console.log(frame)
    }

    if (shouldHaveSource) {
      t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path', 'pre_context', 'context_line', 'post_context'])
    } else {
      t.deepEqual(Object.keys(frame), ['filename', 'lineno', 'function', 'in_app', 'abs_path'])
    }

    t.equal(typeof frame.filename, 'string')
    t.ok(Number.isFinite(frame.lineno))
    t.equal(typeof frame.function, 'string')
    t.equal(typeof frame.in_app, 'boolean')
    t.equal(typeof frame.abs_path, 'string')

    if (shouldHaveSource) {
      t.ok(Array.isArray(frame.pre_context))
      t.equal(frame.pre_context.length, 2)
      t.equal(typeof frame.context_line, 'string')
      t.ok(frame.context_line.length > 0)
      t.ok(Array.isArray(frame.post_context))
      t.equal(frame.post_context.length, 2)
    }
  }
}
