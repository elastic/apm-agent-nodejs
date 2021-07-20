'use strict'

const agent = require('../..').start({
  metricsInterval: 0,
  centralConfig: false
})

const test = require('tape')

const origConsoleError = console.error
const origCaptureErorr = agent.captureError
const origSendError = agent._transport.sendError

test('should capture uncaught exceptions but not log if disabled', function (t) {
  t.plan(7)

  t.on('end', function () {
    console.error = origConsoleError
    agent.captureError = origCaptureErorr
    agent._transport.sendError = origSendError
  })

  console.error = function (loggedError) {
    t.fail('should not write the error to STDERR')
  }

  agent.captureError = function (caughtError) {
    t.strictEqual(caughtError, thrownError, 'should capture the error')
    return origCaptureErorr.apply(this, arguments)
  }

  agent._transport.sendError = function (sentError) {
    t.strictEqual(sentError.exception.message, thrownError.message, 'error.exception.message')
    t.strictEqual(sentError.exception.type, 'Error', 'error.exception.type')
    t.strictEqual(sentError.exception.handled, false, 'error.exception.handled')
    t.ok(Array.isArray(sentError.exception.stacktrace), 'should have a stack trace')
    t.ok(sentError.exception.stacktrace.length > 0, 'stack trace should contain frames')
    t.ok(__filename.includes(sentError.exception.stacktrace[0].filename), 'top frame should be this file')
  }

  const thrownError = new Error('foo')

  throw thrownError
})
