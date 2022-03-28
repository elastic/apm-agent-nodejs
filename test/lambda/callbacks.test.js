'use strict'

const test = require('tape')
const lambdaLocal = require('lambda-local')

const { elasticApmAwsLambda } = require('../../lib/lambda')
const AgentMock = require('./mock/agent')
const util = require('./_util')
const assertError = util.assertError
const assertTransaction = util.assertTransaction

process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x'
process.env.AWS_REGION = 'us-east-1'

test('success', function (t) {
  const name = 'greet.hello'
  const input = { name: 'world' }
  const output = 'Hello, world!'

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)
  let lambdaStartCalled = null

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((_event, _context, callback) => {
        lambdaStartCalled = agent._transport.lambdaStartCalled
        callback(null, `Hello, ${_event.name}!`)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0, // set to `3` for debugging output
    callback: function (err, result) {
      t.ok(lambdaStartCalled,
        '_transport.lambdaStart() had been called before handler code executed')

      t.error(err, `no error executing: err=${JSON.stringify(err)}`)
      t.strictEqual(result, output, 'handler result')

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0, 'no errors captured')

      t.strictEqual(agent.transactions.length, 1, 'one transaction was started')
      assertTransaction(t, agent.transactions[0], name, 'transaction.name')

      t.end()
    }
  })
})

test('failure', function (t) {
  const name = 'fn.fail'
  const input = {}
  const error = new Error('fail')

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((_event, _context, callback) => {
        callback(error)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0, // set to `3` for debugging output
    callback: function (err, result) {
      t.ok(err)
      t.notOk(result)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 1)
      assertError(t, agent.errors[0], error)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], name)

      t.end()
    }
  })
})
