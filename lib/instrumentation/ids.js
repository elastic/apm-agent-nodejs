'use strict'

const { stringify } = require('querystring')

class Ids {
  toString () {
    return stringify(this, ' ', '=')
  }
}

class SpanIds extends Ids {
  constructor (span) {
    super()
    this['trace.id'] = span.traceId
    this['span.id'] = span.id
    Object.freeze(this)
  }
}

class TransactionIds extends Ids {
  constructor (transaction) {
    super()
    this['trace.id'] = transaction.traceId
    this['transaction.id'] = transaction.id
    Object.freeze(this)
  }
}

module.exports = {
  Ids,
  SpanIds,
  TransactionIds
}
