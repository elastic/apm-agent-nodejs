'use strict'
const tape = require('tape')
const agent = require('..').start({ logLevel: 'off' })

// this test suite ensure the behavior of the spanFramesMinDuration
// configuration variable works as intended
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
    agent._config({ logLevel: 'off', spanFramesMinDuration: '100ms' })
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

  suite.test('over configured value has stack trace', function (t) {
    agent._config({ logLevel: 'off', spanFramesMinDuration: '100ms' })
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

  suite.test('spanFrameMinDuration=0 sets no stack traces', function (t) {
    agent._config({ logLevel: 'off', spanFramesMinDuration: '0' })
    const trans = agent.startTransaction()
    const span = agent.startSpan()
    setTimeout(function () {
      span.end()
      trans.end()
      // t.ok(false,'we are parsing the callsites after we are encoded the span')
      span._encode(function (err, data) {
        t.error(err)
        t.ok(!data.stacktrace, 'stacktrace is not set')
        t.end()
      })
    }, 1)
  })

  suite.test('spanFrameMinDuration=<negative> always sets', function (t) {
    agent._config({ logLevel: 'off', spanFramesMinDuration: '-1' })
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
    }, 200)
  })

  suite.test('spanFrameMinDuration < -1 always sets', function (t) {
    agent._config({ logLevel: 'off', spanFramesMinDuration: '-2' })
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
    }, 200)
  })

  suite.end()
})
