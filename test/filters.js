'use strict'

const test = require('tape')

const Filters = require('../lib/filters')
const filterHttpHeaders = require('../lib/filters/http-headers')

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
    return result.context.request.headers
  } catch (err) {}
}

test('set-cookie', function (t) {
  const filters = new Filters()

  filters.add(filterHttpHeaders)

  const result = filters.process(
    makeTransactionWithHeaders({
      'set-cookie': [
        'password=this-is-a-password',
        'card=1234%205678%201234%205678; Secure'
      ]
    })
  )

  t.deepEqual(getHeaders(result), {
    'set-cookie': [
      'password=%5BREDACTED%5D',
      'card=%5BREDACTED%5D; Secure'
    ]
  })

  t.end()
})
