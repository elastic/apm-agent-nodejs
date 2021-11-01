'use strict'

module.exports = class TransactionMock {
  constructor (name, type, opts) {
    this.name = name
    this.type = type
    this.ended = false
    this.customContext = {}
    this._faas = {}
    this.outcome = 'success'
    this.opts = opts
  }

  setCustomContext (custom) {
    Object.assign(this.customContext, custom)
  }

  setCloudContext (cloud) {
    Object.assign(this._cloud = cloud)
  }

  setMessageContext (message) {
    Object.assign(this._message = message)
  }

  setServiceContext (serviceContext) {
    if (!serviceContext) return
    this._service = Object.assign(this._service || {}, serviceContext)
  }

  setFaas (context) {
    Object.assign(this._faas, context)
  }

  setOutcome (outcome) {
    this.outcome = outcome
  }

  end () {
    this.ended = true
  }
}
