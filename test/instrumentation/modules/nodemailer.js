var agent = require('../../..').start({
  serviceName: 'test',
  secretToken: 'test',
  captureExceptions: false
})

var test = require('tape')
var mockClient = require('../../_mock_http_client')
var nodemailer = require('nodemailer')

var mockMailOptions = {
  from: 'sender',
  to: 'receiver',
  subject: 'hello',
  text: 'hello world!'
}

test('transport.sendMail', function (t) {
  resetAgent(done(t))

  var mockTransport = {
    name: 'testingTransport',
    version: '0.1.0',
    send: (mail, callback) => {
      process.nextTick(() => {
        callback()
      })
    }
  }

  const transport = nodemailer.createTransport(mockTransport)

  agent.startTransaction('foo', 'nodemailer')
  transport.sendMail(mockMailOptions, function (err, result) {
    if (err) {
      agent.captureError(err)
    }
    agent.flush()
  })
})

function done (t) {
  return function (data) {
    t.equal(data.transactions.length, 1)
    t.equal(data.spans.length, 1)

    var transaction = data.transactions[0]
    var span = data.spans[0]
    t.equal(transaction.name, 'foo')
    t.equal(transaction.type, 'nodemailer')
    t.equal(span.name, 'Send Email')
    t.equal(span.type, 'nodemailer')

    t.end()
  }
}

function resetAgent (cb) {
  agent._instrumentation.currentTransaction = null
  agent._transport = mockClient(2, cb)
  agent.captureError = function (err) { throw err }
}
