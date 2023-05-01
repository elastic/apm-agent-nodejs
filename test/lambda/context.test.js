/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

if (process.env.ELASTIC_APM_CONTEXT_MANAGER === 'patch') {
  console.log('# SKIP Lambda instrumentation currently does not work with contextManager="patch"')
  process.exit()
}

const test = require('tape')
const lambdaLocal = require('lambda-local')

const { elasticApmAwsLambda } = require('../../lib/lambda')
const AgentMock = require('./mock/agent')
const util = require('./_util')
const assertError = util.assertError
const assertTransaction = util.assertTransaction

process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs14.x'
process.env.AWS_REGION = 'us-east-1'

test('context.succeed', function (t) {
  const name = 'greet.hello'
  const input = { name: 'world' }
  const output = 'Hello, world!'
  let context

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((payload, _context) => {
        context = _context
        context.succeed(`Hello, ${payload.name}!`)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      t.strictEqual(result, output)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], name)

      t.end()
    }
  })
})

test('context.done', function (t) {
  const name = 'greet.hello'
  const input = { name: 'world' }
  const output = 'Hello, world!'

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((payload, context) => {
        context.done(null, `Hello, ${payload.name}!`)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0,
    callback: function (err, result) {
      t.error(err)
      t.strictEqual(result, output)

      t.ok(agent.flushes.length && agent.flushes[agent.flushes.length - 1].lambdaEnd,
        'agent._flush({lambdaEnd: true}) was called')

      t.strictEqual(agent.errors.length, 0)

      t.strictEqual(agent.transactions.length, 1)
      assertTransaction(t, agent.transactions[0], name)

      t.end()
    }
  })
})

test('context.fail', function (t) {
  const name = 'fn.fail'
  const input = {}
  const error = new Error('fail')

  const agent = new AgentMock()
  const wrap = elasticApmAwsLambda(agent)

  lambdaLocal.execute({
    event: input,
    lambdaFunc: {
      [name]: wrap((payload, context) => {
        context.fail(error)
      })
    },
    lambdaHandler: name,
    timeoutMs: 3000,
    verboseLevel: 0,
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
