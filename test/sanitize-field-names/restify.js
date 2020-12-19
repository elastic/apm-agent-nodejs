'use strict'
const {
  createAgentConfig,
  resetAgent,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture,
  assertFormsWithFixture
} = require('./_shared')
const agent = require('../..').start(createAgentConfig())
const test = require('tape')
const request = require('request')
const restify = require('restify')
const fixtures = require('./_fixtures')

test('Running fixtures with restify', function (t1) {
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
  // restify's body parser does not (appear to?)
  // offer the ability to parse into anything
  // other than an object -- i.e. no "text"
  // or raw/Buffer options
  return restify.plugins.bodyParser()
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
  const server = restify.createServer()
  if (middleware) {
    server.use(middleware)
  }

  // resets agent values for tests.  Callback fires
  // after mockClient receives data
  resetAgent(agent, (data) => {
    const transaction = data.transactions.pop()
    assertRequestHeadersWithFixture(transaction, expected, t)
    assertResponseHeadersWithFixture(transaction, expected, t)
    assertFormsWithFixture(transaction, expected, t)
  })

  // register request handler
  server.post('/test', function (req, res, next) {
    t.ok('received request', 'received request')
    for (const [header, value] of Object.entries(responseHeaders)) {
      res.header(header, value)
    }
    res.send('Hello World')
    next()
  })

  server.listen(0, '0.0.0.0', () => {
    const url = `${server.url}/test`
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
      }
    )
  })
}
