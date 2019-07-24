'use strict'

process.env.ELASTIC_APM_TEST = true

var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

var pug = require('pug')
var test = require('tape')

var mockClient = require('../../_mock_http_client')
var findObjInArray = require('../../_utils').findObjInArray

test('pug compile and render', function userLandCode (t) {
  resetAgent(function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 2)

    var trans = data.transactions[0]

    t.ok(/^foo\d$/.test(trans.name))
    t.equal(trans.type, 'custom')

    const types = ['template.pug.compile', 'template.pug.render']
    for (const type of types) {
      const span = findObjInArray(data.spans, 'type', type)
      t.ok(span, 'should have span of type ' + type)
      t.equal(span.name, 'pug')
      t.ok(span.stacktrace.some(function (frame) {
        return frame.function === 'userLandCode'
      }), 'include user-land code frame')
    }

    t.end()
  })

  agent.startTransaction('foo1')

  var template = pug.compile('p Hello, #{name}!')
  var output = template({ name: 'world' })
  t.equal(output, '<p>Hello, world!</p>', 'compiled string should be Hello,world!')
  agent.endTransaction()
  agent.flush()
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(3, cb)
  agent.captureError = function (err) { throw err }
}
