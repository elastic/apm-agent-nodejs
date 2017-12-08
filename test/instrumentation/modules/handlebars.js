'use strict'

process.env.ELASTIC_APM_TEST = true

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var handlebars = require('handlebars')

test('handlebars compile and render', function userLandCode (t) {
  resetAgent(function (endpoint, headers, data, cb) {
    t.equal(data.transactions.length, 1)

    var trans = data.transactions[0]

    t.ok(/^foo\d$/.test(trans.name))
    t.equal(trans.type, 'custom')

    t.equal(trans.spans.length, 2)

    t.equal(trans.spans[0].name, 'handlebars')
    t.equal(trans.spans[0].type, 'template.handlebars.compile')
    t.ok(trans.spans[0].stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    t.equal(trans.spans[1].name, 'handlebars')
    t.equal(trans.spans[1].type, 'template.handlebars.render')
    t.ok(trans.spans[1].stacktrace.some(function (frame) {
      return frame.function === 'userLandCode'
    }), 'include user-land code frame')

    t.end()
  })

  agent.startTransaction('foo1')

  var template = handlebars.compile('Hello, {{name}}!')
  template({ name: 'world' })

  agent.endTransaction()
  agent._instrumentation._queue._flush()
})

function resetAgent (cb) {
  agent._instrumentation._queue._clear()
  agent._instrumentation.currentTransaction = null
  agent._httpClient = { request: cb || function () {} }
  agent.captureError = function (err) { throw err }
}
