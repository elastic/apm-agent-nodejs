'use strict'

module.exports = class TransactionMock {
  constructor (name, type, opts) {
    this.name = name
    this.type = type
    this.ended = false
    this.customContext = {}
    this.outcome = 'success'
    this.opts = opts
  }

  setCustomContext (custom) {
    Object.assign(this.customContext, custom)
  }

  setOutcome (outcome) {
    this.outcome = outcome
  }

  end () {
    this.ended = true
  }
}
