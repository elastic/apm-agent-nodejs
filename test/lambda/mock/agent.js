const TransactionMock = require('./transaction')

module.exports = class AgentMock {
  constructor () {
    this.flushed = false
    this.transactions = []
    this.errors = []
  }

  startTransaction (name, type) {
    const trans = new TransactionMock(name, type)
    this.transactions.push(trans)
    return trans
  }

  captureError (error, callback) {
    this.errors.push(error)
    if (callback) {
      setImmediate(callback)
    }
  }

  flush (callback) {
    this.flushed = true
    if (callback) {
      setImmediate(callback)
    }
  }
}
