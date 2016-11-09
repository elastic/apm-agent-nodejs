'use strict'

module.exports = assert

// {
//   traces: {
//     groups: [ { extra: { _frames: [Object] }, kind: 'transaction', parents: [], signature: 'transaction', timestamp: '2016-06-14T22:34:00.000Z', transaction: 'GET unknown route' } ],
//     raw: [ [ 5.404068, [ 0, 0, 5.404068 ] ] ]
//   },
//   transactions: [ { durations: [ 5.404068 ], kind: 'web.http', result: 200, timestamp: '2016-06-14T22:34:00.000Z', transaction: 'GET unknown route' } ]
// }
function assert (t, data) {
  t.equal(data.transactions[0].kind, 'web.http')
  t.equal(data.transactions[0].result, 200)
  t.equal(data.transactions[0].transaction, 'GET unknown route')

  t.equal(data.traces.groups.length, 1)
  t.equal(data.traces.raw.length, 1)
  t.equal(data.transactions.length, 1)
  t.equal(data.traces.groups[0].kind, 'transaction')
  t.deepEqual(data.traces.groups[0].parents, [])
  t.equal(data.traces.groups[0].signature, 'transaction')
  t.equal(data.traces.groups[0].transaction, 'GET unknown route')

  t.equal(data.traces.raw[0].length, 3)
  t.equal(data.traces.raw[0][1].length, 3)
  t.equal(data.traces.raw[0][1][0], 0)
  t.equal(data.traces.raw[0][1][1], 0)
  t.equal(data.traces.raw[0][1][2], data.traces.raw[0][0])
  t.equal(data.traces.raw[0][2].http.method, 'GET')
  t.deepEqual(data.transactions[0].durations, [data.traces.raw[0][0]])
}
