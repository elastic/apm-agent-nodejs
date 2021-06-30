'use strict'

module.exports = class TransactionMock {
  constructor (name, type, opts) {
    this.name = name
    this.type = type
    this.ended = false
    this.customContext = {}
    this.opts = opts
  }

  setCustomContext (custom) {
    Object.assign(this.customContext, custom)
  }

  end () {
    this.ended = true
  }
}
