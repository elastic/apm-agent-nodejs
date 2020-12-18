const {
  createAgentConfig,
  resetAgent,
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture
} = require('./shared')
const agent = require('../..').start(createAgentConfig())
const test = require('tape')
const request = require('request')
const Hapi = require('@hapi/hapi')
const fixtures = require('./fixtures')

test('Running fixtures with hapi', function (t1) {
  for (const [, fixture] of fixtures.entries()) {
    test(fixture.name, function (t2) {
      runTest(
        t2,
        fixture.expected,
        createAgentConfig(fixture.agentConfig),
        fixture.input.requestHeaders,
        fixture.input.responseHeaders,
        fixture.input.formFields,
        false // hapi does body parsing by default, no middleware
      )
    })
  }
  t1.end()
})

async function runTest (
  t, expected, agentConfig, requestHeaders, responseHeaders, formFields, middleware = false
) {
  // register a listener to close the server when we're done
  const done = () => {
    server.stop()
  }
  t.on('end', done)

  // configure agent and instantiated new app
  agent._config(agentConfig)
  const server = Hapi.server({
    port: 0,
    host: '0.0.0.0'
  })

  // resets agent values for tests.  Callback fires
  // after mockClient receives data
  resetAgent(agent, (data) => {
    const transaction = data.transactions.pop()
    assertRequestHeadersWithFixture(transaction, expected, t)
    assertResponseHeadersWithFixture(transaction, expected, t)
    // TO DO: uncomment once we fix https://...
    // assertFormsWithFixture(transaction, expected, t)
  })

  // register request handler
  server.route({
    method: 'POST',
    path: '/test',
    handler: (request, h) => {
      t.ok('received request', 'received request')
      const response = h.response('Hello World!')
      for (const [header, value] of Object.entries(responseHeaders)) {
        response.header(header, value)
      }
      return response
    }
  })

  await server.start()
  const url = `http://${server.info.host}:${server.info.port}/test`
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
}
