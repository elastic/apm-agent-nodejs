/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const constants = require('../../../lib/constants')

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
    this.outcome = constants.OUTCOME_UNKNOWN
    this._links = []
    this.opts = opts
  }

  setDefaultName (name) {
    this.name = name
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

  _addLinks (links) {
    this._links = this._links.concat(links)
  }

  end () {
    this.ended = true
  }
}
