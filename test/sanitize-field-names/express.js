const agent = require('../..').start(createAgentConfig())
const test = require('tape')
const request = require('request')
const express = require('express')
const bodyParser = require('body-parser')
const mockClient = require('../_mock_http_client')
const querystring = require('querystring')
function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}

/**
 * Attempts to parse a string first as JSON, then as a query string
 */
function getBodyAsObject(string) {
  if(!string) {
    return {}
  }
  try {
    return JSON.parse(string)
  } catch (e) {
    return querystring.parse(string)
  }
}

/**
 * Checks that payload data meets expectations of test fixtures
 */
function assertHeadersAndPostedFormWithFixture(transaction, expected, t) {
  t.ok(transaction, 'generated transaction')
    // assert request headers here
  for(const [header,value] of Object.entries(expected.requestHeaders.defined)) {
    t.ok(transaction.context.request.headers[header.toLowerCase()],`header "${header}" is still set`)
    t.equals(transaction.context.request.headers[header.toLowerCase()], value, `key "${header}" has correct value`)
  }
  for(const [,header] of expected.requestHeaders.undefined.entries()) {
    t.ok(
      !transaction.context.request.headers[header.toLowerCase()],
      `header "${header}" is not set`
    )
  }

  // assert response headers here
  for(const [header,value] of Object.entries(expected.responseHeaders.defined)) {
    t.ok(transaction.context.response.headers[header.toLowerCase()],`header "${header}" is still set`)
    t.equals(transaction.context.response.headers[header.toLowerCase()], value, `key "${header}" has correct value`)
  }
  for(const [,header] of expected.responseHeaders.undefined.entries()) {
    t.ok(
      !transaction.context.response.headers[header.toLowerCase()],
      `header "${header}" is not set`
    )
  }

  // assert post/body headers here
  const bodyAsObject = getBodyAsObject(transaction.context.request.body)
  for(const [key,value] of Object.entries(expected.formFields.defined)) {
    t.ok(bodyAsObject[key],`key "${key}" is still set`)
    t.equals(bodyAsObject[key], value, `key "${key}" has correct value`)
  }
  for(const [,key] of expected.formFields.undefined.entries()) {
    t.ok(!bodyAsObject[key],`key "${key}" is not set`)
  }
}

function runTest(
  t, expected, agentConfig, requestHeaders,responseHeaders,formFields, middleware=false
) {
  agent._config(agentConfig)
  const app = express()
  if(middleware) {
    app.use(middleware)
  }

  resetAgent((data) => {
    const transaction = data.transactions.pop()
    assertHeadersAndPostedFormWithFixture(transaction, expected, t)
  })

  app.post('/test', (req, res) => {
    t.ok('received request', 'received request')
    res.header(responseHeaders)
    res.send('Hello World')
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

  const done = () => {
    server.close()
  }
  t.on('end', done)
}

function createAgentConfig(values={}) {
  const defaultAgentConfig = {
    serviceName: 'test',
    secretToken: 'test',
    captureExceptions: false,
    metricsInterval: 0,
    centralConfig: false,
    captureBody: 'all'
  }

  const agentConfig = Object.assign(
    values,
    defaultAgentConfig
  )
  return agentConfig
}
const fixtures = require('./fixtures')

// const agentConfig = createAgentConfig({
//   sanitizeFieldNames:['thi*isa']
// })
// const middleware = bodyParser.urlencoded({ extended: false })
// app.use(bodyParser.urlencoded({ extended: false }))
// app.use(bodyParser.raw({type:'*/*'}))
// app.use(bodyParser.text({type:'*/*'}))

function createMiddleware(type) {
  if ('urlencoded' === type) {
    return bodyParser.urlencoded({ extended: false })
  } else if ('text' === type) {
    return bodyParser.text({type:'*/*'})
  } else if ('raw' === type) {
    return bodyParser.raw({type:'*/*'})
  }

  throw new Error(`I don't know how to create a ${type} middleware`)
}

test('express test default handling', function (t) {
  for(const [,fixture] of fixtures.entries()) {
    test(fixture.name, function(t2){
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
  t.end()
})
