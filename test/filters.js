'use strict'

const test = require('tape')

const Filters = require('object-filter-sequence')
const filterHttpHeaders = require('../lib/filters/http-headers')

function makeTransactionWithHeaders (headers) {
  return {
    context: {
      request: {
        headers
      },
      response: {
        headers
      }
    }
  }
}

function getRequestHeaders (result) {
  try {
    return result.context.request.headers
  } catch (err) {}
}

function getResponseHeaders (result) {
  try {
    return result.context.response.headers
  } catch (err) {}
}

test('set-cookie', function (t) {
  const filters = new Filters()

  filters.push(filterHttpHeaders)

  const result = filters.process(
    makeTransactionWithHeaders({
      'set-cookie': [
        'password=this-is-a-password',
        'card=1234%205678%201234%205678; Secure'
      ]
    })
  )

  t.deepEqual(getRequestHeaders(result), {
    'set-cookie': [
      'password=%5BREDACTED%5D',
      'card=%5BREDACTED%5D; Secure'
    ]
  })

  t.deepEqual(getResponseHeaders(result), {
    'set-cookie': [
      'password=%5BREDACTED%5D',
      'card=%5BREDACTED%5D; Secure'
    ]
  })

  t.end()
})
