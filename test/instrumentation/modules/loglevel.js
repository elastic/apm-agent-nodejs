'use strict'

process.env.ELASTIC_APM_TEST = true

const agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false
})

const test = require('tape')

const mockClient = require('../../_mock_http_client')

test('augments log messages', function (t) {
  resetAgent(() => {})

  const trans = agent.startTransaction('foo')

  const inputs = [
    'wat',
    { foo: 'bar' }
  ]

  const outputs = [
    trans.toString()
  ].concat(inputs)

  const warn = console.warn
  t.on('end', () => {
    console.warn = warn
  })
  console.warn = function patchedWarn (...args) {
    t.deepEqual(args, outputs)
    t.end()
  }

  // NOTE: This needs to be loaded after patching console.warn
  const log = require('loglevel')
  log.warn(...inputs)

  agent.endTransaction()
  agent.flush()
})

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(3, cb)
  agent.captureError = function (err) { throw err }
}
