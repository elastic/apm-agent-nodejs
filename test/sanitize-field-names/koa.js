'use strict'
const {
  createAgentConfig,
  resetAgent,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture
} = require('./_shared')
const agent = require('../..').start(createAgentConfig())
const test = require('tape')
const request = require('request')
const Koa = require('koa')
const koaBodyparser = require('koa-bodyparser')
const fixtures = require('./_fixtures')

test('Running fixtures with koa', function (t1) {
  for (const [, fixture] of fixtures.entries()) {
    test(fixture.name, function (t2) {
      runTest(
        t2,
        fixture.expected,
        createAgentConfig(fixture.agentConfig),
        fixture.input.requestHeaders,
        fixture.input.responseHeaders,
        fixture.input.formFields,
        createMiddleware(fixture.bodyParsing)
      )
    })
  }
  t1.end()
})

function createMiddleware (type) {
  return koaBodyparser()
}

function runTest (
  t, expected, agentConfig, requestHeaders, responseHeaders, formFields, middleware = false
) {
  // register a listener to close the server when we're done
  const done = () => {
    server.close()
  }
  t.on('end', done)

  // configure agent and instantiated new app
  agent._config(agentConfig)
  const app = new Koa()
  if (middleware) {
    app.use(middleware)
  }

  // resets agent values for tests.  Callback fires
  // after mockClient receives data
  resetAgent(agent, (data) => {
    const transaction = data.transactions.pop()
    assertRequestHeadersWithFixture(transaction, expected, t)
    assertResponseHeadersWithFixture(transaction, expected, t)
    // TODO: uncomment once we fix
    // https://github.com/elastic/apm-agent-nodejs/issues/1904
    // assertFormsWithFixture(transaction, expected, t)
  })

  // register request handler
  app.use(async ctx => {
    t.ok('received request', 'received request')
    ctx.set(responseHeaders)
    ctx.body = 'Hello World'
  })

  const server = app.listen(0, '0.0.0.0', () => {
    const url = `http://${server.address().address}:${server.address().port}/test`
    request.post(
      url,
      {
        form: formFields,
        headers: requestHeaders
      },
      function (error, response, body) {
        if (error) {
          t.fail(error)
        }
        t.ok(body, 'received response')
        t.end()
      })
  })
}
