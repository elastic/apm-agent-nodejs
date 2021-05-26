'use strict'
const tape = require('tape')
const agent = require('..').start({logLevel:'off'})

tape.test(function (suite) {
  suite.test('under 10ms (default) has no stack trace', function (t) {
    const trans = agent.startTransaction()
    const span = agent.startSpan()
    span.end()
    trans.end()
    // t.ok(false,'we are parsing the callsites after we are encoded the span')
    span._encode(function (err, data) {
      t.error(err)
      t.ok(!data.stacktrace, 'stacktrace not set')
      t.end()
    })
  })

  suite.test('over 10ms (default) has stack trace', function (t) {
    const trans = agent.startTransaction()
    const span = agent.startSpan()
    setTimeout(function () {
      span.end()
      trans.end()
      // t.ok(false,'we are parsing the callsites after we are encoded the span')
      span._encode(function (err, data) {
        t.error(err)
        t.ok(data.stacktrace, 'stacktrace is set')
        t.end()
      })
    }, 20)
  })

  suite.test('under configured value has no stack trace', function (t) {
    agent._config({logLevel:'off', captureSpanStackTracesThreshold:'100ms'})
    const trans = agent.startTransaction()
    const span = agent.startSpan()
    setTimeout(function () {
      span.end()
      trans.end()
      // t.ok(false,'we are parsing the callsites after we are encoded the span')
      span._encode(function (err, data) {
        t.error(err)
        t.ok(!data.stacktrace, 'stacktrace not set')
        t.end()
      })
    }, 50)
  })

  suite.test('over configured value has has stack trace', function (t) {
    agent._config({logLevel:'off', captureSpanStackTracesThreshold:'100ms'})
    const trans = agent.startTransaction()
    const span = agent.startSpan()
    setTimeout(function () {
      span.end()
      trans.end()
      // t.ok(false,'we are parsing the callsites after we are encoded the span')
      span._encode(function (err, data) {
        t.error(err)
        t.ok(data.stacktrace, 'stacktrace set')
        t.end()
      })
    }, 101)
  })

  suite.end()
})
