'use strict'

module.exports = assert

function assert (t, data) {
  t.equal(data.transactions.length, 1, 'should have one transaction')
  t.equal(data.spans.length, 0, 'should have zero spans')

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET unknown route', 'should have expected transaction name')
  t.equal(trans.type, 'request', 'should have expected transaction type')
  t.equal(trans.result, 'HTTP 2xx', 'should have expected transaction result')
  t.equal(trans.context.request.method, 'GET', 'should have expected transaction context.request.method')
}
