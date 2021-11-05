'use strict'

module.exports = class TransactionMock {
  constructor (name, type, opts) {
    this.name = name
    this.type = type
    this.ended = false
    this.customContext = {}
    this._faas = {}
    this._service = undefined
    this._cloud = undefined
    this._message = undefined
    this._service = undefined
    this.outcome = 'success'
    this.opts = opts
  }

  setCustomContext (custom) {
    if (!custom) {
      return
    }
    Object.assign(this.customContext, custom)
  }

  setCloudContext (cloud) {
    if (!cloud) {
      return
    }
    this._cloud = Object.assign(this._cloud || {}, cloud)
  }

  setMessageContext (message) {
    if (!message) {
      return
    }
    this._message = Object.assign(this._message || {}, message)
  }

  setServiceContext (serviceContext) {
    if (!serviceContext) {
      return
    }
    this._service = Object.assign(this._service || {}, serviceContext)
  }

  setFaas (faasContext) {
    if (!faasContext) {
      return
    }
    this._faas = Object.assign(this._faas || {}, faasContext)
  }

  setOutcome (outcome) {
    this.outcome = outcome
  }

  end () {
    this.ended = true
  }
}
