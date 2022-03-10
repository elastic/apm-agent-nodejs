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

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((_event, _context, callback) => {
        callback(null, `Hello, ${_event.name}!`)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0, // set to 3 for verbose logging of the execution
    callback: function (err, result) {
      t.error(err, `no error executing: err=${JSON.stringify(err)}`)
      t.strictEqual(result, output)

      t.ok(agent.flushed)

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], name)

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
    verboseLevel: 0,
    callback: function (err, result) {
      t.ok(err)
      t.notOk(result)

      t.ok(agent.flushed)

      t.strictEqual(agent.errors.length, 1)
      assertError(t, agent.errors[0], error)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], name)

      t.end()
    }
  })
})
