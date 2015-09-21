'use strict'

var Transaction = require('./transaction')
var request = require('../request')

var MAX_BUFFER_SIZE = Infinity
var MAX_SEND_DELAY = 60000

var Transactions = module.exports = function (client) {
  if (!(this instanceof Transactions)) return new Transactions(client)
  this._client = client
  this._buffer = []
}

Transactions.prototype.add = function (transaction) {
  if (this._client.active) this._buffer.push(transaction)
  if (this._buffer.length >= MAX_BUFFER_SIZE) this._send()
  else if (this._buffer.length && !this._timeout) this._queueSend()
}

Transactions.prototype.new = function (name, type, result) {
  return new Transaction(this, name, type, result)
}

Transactions.prototype._send = function () {
  clearTimeout(this._timeout)
  this._timeout = null
  request.transactions(this._client, this._flush()) // TODO: Maybe add callback and re-buffer stuff incase of a transmission error?
}

Transactions.prototype._queueSend = function () {
  this._timeout = setTimeout(this._send.bind(this), MAX_SEND_DELAY) // TODO: Should we unref the _timeout?
}

Transactions.prototype._flush = function () {
  var groups = groupTransactions(this._buffer)
  this._buffer = []
  return { transactions: groups }
}

function groupTransactions (transactions) {
  var groups = {}

  transactions.forEach(function (trans) {
    var key = trans.groupingKey()
    if (key in groups) groups[key].push(trans)
    else groups[key] = [trans]
  })

  return Object.keys(groups).map(function (key) {
    var trans = groups[key][0]
    var durations = groups[key].map(function (trans) {
      return trans.duration()
    })
    return {
      transaction: trans.name,
      result: trans.result,
      kind: trans.type,
      timestamp: trans.groupingTs().toISOString(),
      durations: durations
    }
  })
}
