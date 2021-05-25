'use strict'
const tape = require('tape')
const Agent = require('./_agent')

tape.test(function (suite) {
  // suite.test('under 10ms (default) has no stack trace', function (t) {
  //   const agent = Agent().start({ logLevel: 'off' })
  //   const trans = agent.startTransaction()
  //   const span = agent.startSpan()
  //   span.end()
  //   trans.end()
  //   // t.ok(false,'we are parsing the callsites after we are encoded the span')
  //   span._encode(function (err, data) {
  //     t.error(err)
  //     t.ok(!data.stacktrace, 'stacktrace not set')
  //     t.end()
  //   })
  // })

  // suite.test('over 10ms (default) has stack trace', function (t) {
  //   const agent = Agent().start({ logLevel: 'off' })
  //   const trans = agent.startTransaction()
  //   const span = agent.startSpan()
  //   setTimeout(function () {
  //     span.end()
  //     trans.end()
  //     // t.ok(false,'we are parsing the callsites after we are encoded the span')
  //     span._encode(function (err, data) {
  //       t.error(err)
  //       t.ok(data.stacktrace, 'stacktrace is set')
  //       t.end()
  //     })
  //   }, 20)
  // })

  // suite.test('under configured value has no stack trace', function (t) {
  //   const agent = Agent().start({ logLevel: 'off', captureSpanStackTracesThreshold: '500ms' })
  //   const trans = agent.startTransaction()
  //   const span = agent.startSpan()
  //   setTimeout(function () {
  //     span.end()
  //     trans.end()
  //     // t.ok(false,'we are parsing the callsites after we are encoded the span')
  //     span._encode(function (err, data) {
  //       t.error(err)
  //       t.ok(!data.stacktrace, 'stacktrace not set')
  //       t.end()
  //     })
  //   }, 50)
  // })

  // suite.test('over configured value has has stack trace', function (t) {
  //   const agent = Agent().start({ logLevel: 'off', captureSpanStackTracesThreshold: '500ms' })
  //   const trans = agent.startTransaction()
  //   const span = agent.startSpan()
  //   setTimeout(function () {
  //     span.end()
  //     trans.end()
  //     // t.ok(false,'we are parsing the callsites after we are encoded the span')
  //     span._encode(function (err, data) {
  //       t.error(err)
  //       t.ok(data.stacktrace, 'stacktrace set')
  //       t.end()
  //     })
  //   }, 501)
  // })

  suite.end()
})
