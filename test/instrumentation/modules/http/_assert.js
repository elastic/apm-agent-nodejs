'use strict'

module.exports = assert

function assert (t, data) {
  t.equal(data.transactions.length, 1)
  t.equal(data.spans.length, 0)

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET /')
  t.equal(trans.type, 'request')
  t.equal(trans.result, 'HTTP 2xx')
  t.equal(trans.context.request.method, 'GET')
}
