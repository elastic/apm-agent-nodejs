'use strict'

var test = require('tape')

var Filters = require('../lib/filters')

function makeTransactionWithHeaders (headers) {
  return {
    context: {
      request: {
        headers
      }
    }
  }
}

function getHeaders (result) {
  try {
    return result.transactions[0].context.request.headers
  } catch (err) {}
}

test('set-cookie', function (t) {
  const filters = new Filters()
  filters.config({
    filterHttpHeaders: true
  })

  const result = filters.process({
    transactions: [
      makeTransactionWithHeaders({
        'set-cookie': [
          'password=this-is-a-password',
          'card=1234%205678%201234%205678; Secure'
        ]
      })
    ]
  })

  t.deepEqual(getHeaders(result), {
    'set-cookie': [
      'password=%5BREDACTED%5D',
      'card=%5BREDACTED%5D; Secure'
    ]
  })

  t.end()
})
