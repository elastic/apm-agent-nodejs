const agent = require('../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  captureBody: 'all',
  sanitizeFieldNames: ['x-powered-by']
})
const test = require('tape')
const request = require('request')
const express = require('express')
const bodyParser = require('body-parser')
const mockClient = require('../_mock_http_client')

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(1, cb)
  agent.captureError = function (err) { throw err }
}

test('express tests', function(t) {
  const app = express()
  app.use(bodyParser.urlencoded({extended:false}))
  // app.use(bodyParser.raw({type:'*/*'}))
  // app.use(bodyParser.text({type:'*/*'}))

  resetAgent((data) => {
    t.ok('called reset agent', 'called reset agent', )
    const transaction = data.transactions.pop()
    t.ok(transaction, 'generated transaction')
    console.log(transaction.context.request.headers)
    console.log(JSON.stringify(transaction.context.response.headers))
    console.log(transaction.context)
    // t.strictEqual(data.transactions.length, 1, 'has a transaction')

    // const trans = data.transactions[0]
    // t.strictEqual(trans.name, 'GET /hello/:name', 'transaction name is GET /hello/:name')
    // t.strictEqual(trans.type, 'request', 'transaction type is request')
  })

  app.post('/test', (req, res) => {
    t.ok('received request', 'received request')
    // TODO assert request headers here
    res.send('Hello World')
  })

  const server = app.listen(0, '0.0.0.0', () => {
    const url = `http://${server.address().address}:${server.address().port}/test`
    request.post(url, {form:{thisisa:'test',password:'science'}}, function(error, response, body){
      t.ok(body, 'received response')
      // TODO assert request headers here
      t.end()
    })
  })

  const done = () => {
    server.close()
  }
  t.on('end', done)
});
