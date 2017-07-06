'use strict'

module.exports = assert

function assert (t, data) {
  t.equal(data.transactions.length, 1)

  var trans = data.transactions[0]

  t.equal(trans.name, 'GET unknown route')
  t.equal(trans.type, 'request')
  t.equal(trans.result, '200')
  t.equal(trans.traces.length, 0)
  t.equal(trans.context.request.method, 'GET')
}
