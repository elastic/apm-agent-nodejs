'use strict'

process.env.ELASTIC_APM_TEST = true

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var handlebars = require('handlebars')
var test = require('tape')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

test('handlebars compile and render', function userLandCode (t) {
  resetAgent(function (data) {
    t.strictEqual(data.transactions.length, 1)
    t.strictEqual(data.spans.length, 2)

    var trans = data.transactions[0]

    t.ok(/^foo\d$/.test(trans.name))
    t.strictEqual(trans.type, 'custom')

    const actions = ['compile', 'render']
    for (const action of actions) {
      const span = findObjInArray(data.spans, 'action', action)
      t.ok(span, 'should have span of action ' + action)
      t.strictEqual(span.name, 'handlebars')
      t.strictEqual(span.type, 'template')
      t.strictEqual(span.subtype, 'handlebars')
      t.ok(span.stacktrace.some(function (frame) {
        return frame.function === 'userLandCode'
      }), 'include user-land code frame')
    }

    t.end()
  })

  agent.startTransaction('foo1')

  var template = handlebars.compile('Hello, {{name}}!')
  template({ name: 'world' })

  agent.endTransaction()
  agent.flush()
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(3, cb)
  agent.captureError = function (err) { throw err }
}
