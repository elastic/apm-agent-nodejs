'use strict'

const {
  assertRequestHeadersWithFixture,
  assertResponseHeadersWithFixture,
  createAgentConfig,
  resetAgent
} = require('./_shared')
const agent = require('../..').start(createAgentConfig())

// Skip out of testing hapi if the current version combo is unsupported.
// (See similar logic in "test/instrumentation/modules/hapi/shared.js".)
const semver = require('semver')
const hapiVersion = require('@hapi/hapi/package.json').version
// - hapi 17+ requires Node.js 8.9.0 or higher
if (semver.lt(process.version, '8.9.0') && semver.gte(hapiVersion, '17.0.0')) {
  process.exit()
}
// - hapi 19+ requires Node.js 12 or higher
if (semver.lt(process.version, '12.0.0') && semver.gte(hapiVersion, '19.0.0')) {
  process.exit()
}
// - hapi does not work on early versions of Node.js 10 because of
//   https://github.com/nodejs/node/issues/20516
//   NOTE: Do not use semver.satisfies, as it does not match prereleases
const parsedVer = semver.parse(process.version)
if (parsedVer.major === 10 && parsedVer.minor >= 0 && parsedVer.minor < 8) {
  process.exit()
}

const request = require('request')
const Hapi = require('@hapi/hapi')
const fixtures = require('./_fixtures')

test('Running fixtures with hapi', function (suite) {
  for (const [, fixture] of fixtures.entries()) {
    test(fixture.name, function (t) {
      runTest(
        t,
        fixture.expected,
        createAgentConfig(fixture.agentConfig),
        fixture.input.requestHeaders,
        fixture.input.responseHeaders,
        fixture.input.formFields,
        false // hapi does body parsing by default, no middleware
      )
    })
  }
  suite.end()
})

async function runTest (
  t, expected, agentConfig, requestHeaders, responseHeaders, formFields, middleware = false
) {
  t.timeoutAfter(1000) // ensure no hang

  // register a listener to close the server when we're done
  const done = () => {
    server.stop()
  }
  t.on('end', done)

  // configure agent and instantiated new app
  agent._config(agentConfig)
  const server = Hapi.server({
    port: 0,
    host: 'localhost'
  })

  // resets agent values for tests.  Callback fires
  // after mockClient receives data
  resetAgent(agent, (data) => {
    const transaction = data.transactions.pop()
    assertRequestHeadersWithFixture(transaction, expected, t)
    assertResponseHeadersWithFixture(transaction, expected, t)
    // TODO: uncomment once we fix
    // https://github.com/elastic/apm-agent-nodejs/issues/1905
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

      // Note: Returning a `h.response(...)` from a hapi handler when both
      // (a) node >=v16 and (b) using @hapi/hapi@18.x, the response hangs.
      // We are ignoring this issue and just not testing this combination.
      return response
    }
  })

  await server.start()
  const url = server.info.uri + '/test'
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
