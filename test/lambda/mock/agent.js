/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const { CapturingTransport } = require('../../_capturing_transport')
const logging = require('../../../lib/logging')
const TransactionMock = require('./transaction')

module.exports = class AgentMock {
  constructor (conf) {
    this.flushes = []
    this.transactions = []
    this.errors = []
    this.logger = logging.createLogger('off')
    this._conf = Object.assign({
      // A (very) minimal default `agent._conf` to satisfy "lib/lambda.js" usage.
      active: true,
      usePathAsTransactionName: false
    }, conf)
    this._transport = new CapturingTransport()
  }

  startTransaction (name, type, opts) {
    const trans = new TransactionMock(name, type, opts)
    this.transactions.push(trans)
    return trans
  }

  captureError (error, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    } else if (!opts) {
      opts = {}
    }
    this.errors.push(error)
    if (cb) {
      setImmediate(cb)
    }
  }

  _flush (opts, cb) {
    this.flushes.push(opts)
    this.flush(cb)
  }

  flush (cb) {
    if (cb) {
      setImmediate(cb)
    }
  }
}
