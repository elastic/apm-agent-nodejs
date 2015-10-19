'use strict'

var Transaction = require('./transaction')
var request = require('../request')

var MAX_QUEUE_SIZE = Infinity
var MAX_SEND_DELAY = 60000

var Instrumentation = module.exports = function (client) {
  if (!(this instanceof Instrumentation)) return new Instrumentation(client)
  this._client = client
  this._queue = []
}

Instrumentation.prototype.add = function (transaction) {
  if (this._client.active && this._client._ff_instrument) {
    this._client.logger.trace('[%s] pushing transaction to queue', transaction._uuid)
    this._queue.push(transaction)
  } else {
    this._client.logger.trace('[%s] ignoring transaction', transaction._uuid)
  }
  if (this._queue.length >= MAX_QUEUE_SIZE) this._send()
  else if (this._queue.length && !this._timeout) this._queueSend()
}

Instrumentation.prototype.startTransaction = function (name, type, result) {
  return new Transaction(this._client, name, type, result)
}

Instrumentation.prototype._send = function () {
  this._client.logger.trace('flushing transaction queue')
  clearTimeout(this._timeout)
  this._timeout = null
  request.transactions(this._client, this._flush()) // TODO: Maybe add callback and re-queue stuff incase of a transmission error?
}

Instrumentation.prototype._queueSend = function () {
  this._client.logger.trace('setting timer to flush transaction queue')
  this._timeout = setTimeout(this._send.bind(this), MAX_SEND_DELAY)
  this._timeout.unref()
}

Instrumentation.prototype._flush = function () {
  var transactions = groupTransactions(this._queue)
  var groups = groupTraces([].concat.apply([], this._queue.map(function (trans) {
    return trans.traces
  })))
  var raw = rawTransactions(this._queue)
  this._queue = []
  return {
    transactions: transactions,
    traces: {
      groups: groups,
      raw: raw
    }
  }
}

function groupTransactions (transactions) {
  var groups = groupByMinute(transactions, transactionGroupingKey)

  return Object.keys(groups).map(function (key) {
    var trans = groups[key][0]
    var durations = groups[key].map(function (trans) {
      return trans.duration()
    })
    return {
      transaction: trans.name,
      result: trans.result,
      kind: trans.type,
      timestamp: groupingTs(trans._start).toISOString(),
      durations: durations
    }
  })
}

function rawTransactions (transactions) {
  return transactions.map(function (trans) {
    return [trans.duration()].concat(rawTraces(trans.traces))
  })
}

function rawTraces (traces) {
  return traces.map(function (trace) {
    return [trace._groupIndex, trace.startTime(), trace.duration()]
  })
}

function groupTraces (traces) {
  var groups = groupByMinute(traces, traceGroupingKey)

  return Object.keys(groups).map(function (key, index) {
    var trace = groups[key][0]
    groups[key].forEach(function (trace) {
      trace._groupIndex = index
    })
    return {
      transaction: trace.transaction.name,
      signature: trace.signature,
      kind: trace.type,
      timestamp: groupingTs(trace._start).toISOString(),
      frames: [], // TODO
      parents: trace.ancestors(),
      extra: trace.extra || {}
    }
  })
}

function groupByMinute (arr, grouper) {
  var groups = {}

  arr.forEach(function (obj) {
    var key = grouper(obj)
    if (key in groups) groups[key].push(obj)
    else groups[key] = [obj]
  })

  return groups
}

function groupingTs (ts) {
  return new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours(), ts.getMinutes())
}

function transactionGroupingKey (trans) {
  return groupingTs(trans._start).getTime() + '|' + trans.name + '|' + trans.result + '|' + trans.type
}

function traceGroupingKey (trace) {
  var ancestors = trace.ancestors().map(function (trace) { return trace.signature }).join(',')
  return groupingTs(trace._start).getTime() + '|' + trace.transaction.name + '|' + ancestors + '|' + trace.signature
}
