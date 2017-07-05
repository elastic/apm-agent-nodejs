'use strict'

module.exports = assert

// {
//   traces: {
//     groups: [ { extra: { _frames: [Object] }, kind: 'transaction', parents: [], signature: 'transaction', timestamp: '2016-06-14T22:34:00.000Z', transaction: 'GET unknown route' } ],
//     raw: [ [ 5.404068, [ 0, 0, 5.404068 ] ] ]
//   },
//   transactions: [ { durations: [ 5.404068 ], kind: 'request', result: 200, timestamp: '2016-06-14T22:34:00.000Z', transaction: 'GET unknown route' } ]
// }
function assert (t, data) {
  t.equal(data.transactions[0].kind, 'request')
  t.equal(data.transactions[0].result, 200)
  t.equal(data.transactions[0].transaction, 'GET unknown route')

  t.equal(data.traces.groups.length, 0)
  t.equal(data.traces.raw.length, 0)
  t.equal(data.transactions.length, 1)
}
