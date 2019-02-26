module.exports = class TransactionMock {
  constructor (name, type) {
    this.name = name
    this.type = type
    this.ended = false
    this.customContext = {}
  }

  setCustomContext (custom) {
    Object.assign(this.customContext, custom)
  }

  end () {
    this.ended = true
  }
}
