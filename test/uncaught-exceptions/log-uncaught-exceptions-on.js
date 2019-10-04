'use strict'

const agent = require('../..').start({
  metricsInterval: 0,
  centralConfig: false
})

const test = require('tape')

const origConsoleError = console.error
const origCaptureErorr = agent.captureError
const origSendError = agent._transport.sendError

test('should capture and log uncaught exceptions by default', function (t) {
  t.plan(8)

  t.on('end', function () {
    console.error = origConsoleError
    agent.captureError = origCaptureErorr
    agent._transport.sendError = origSendError
  })

  console.error = function (loggedError) {
    t.equal(loggedError, thrownError, 'should log the error to STDERR')
    return origConsoleError.apply(this, arguments)
  }

  agent.captureError = function (caughtError) {
    t.equal(caughtError, thrownError, 'should capture the error')
    return origCaptureErorr.apply(this, arguments)
  }

  agent._transport.sendError = function (sentError) {
    t.equal(sentError.exception.message, thrownError.message)
    t.equal(sentError.exception.type, 'Error')
    t.equal(sentError.exception.handled, false)
    t.ok(Array.isArray(sentError.exception.stacktrace), 'should have a stack trace')
    t.ok(sentError.exception.stacktrace.length > 0, 'stack trace should contain frames')
    t.ok(__filename.includes(sentError.exception.stacktrace[0].filename), 'top frame should be this file')
  }

  const thrownError = new Error('foo')

  throw thrownError
})
