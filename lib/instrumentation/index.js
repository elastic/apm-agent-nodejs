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
  if (this._client.active) this._queue.push(transaction)
  if (this._queue.length >= MAX_QUEUE_SIZE) this._send()
  else if (this._queue.length && !this._timeout) this._queueSend()
}

Instrumentation.prototype.startTransaction = function (name, type, result) {
  return new Transaction(this, name, type, result)
}

Instrumentation.prototype._send = function () {
  clearTimeout(this._timeout)
  this._timeout = null
  request.transactions(this._client, this._flush()) // TODO: Maybe add callback and re-queue stuff incase of a transmission error?
}

Instrumentation.prototype._queueSend = function () {
  this._timeout = setTimeout(this._send.bind(this), MAX_SEND_DELAY) // TODO: Should we unref the _timeout?
}

Instrumentation.prototype._flush = function () {
  var transactions = groupTransactions(this._queue)
  var traces = groupTraces([].concat.apply([], this._queue.map(function (trans) {
    return trans.traces
  })))
  this._queue = []
  return { transactions: transactions, traces: traces }
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

function groupTraces (traces) {
  var groups = groupByMinute(traces, traceGroupingKey)

  return Object.keys(groups).map(function (key) {
    var trace = groups[key][0]
    var startTimeSum = 0
    var durations = groups[key].map(function (trace) {
      startTimeSum += trace.startTime()
      return [trace.duration(), trace.transaction.duration()]
    })
    return {
      transaction: trace.transaction.name,
      signature: trace.signature,
      durations: durations,
      start_time: startTimeSum / groups[key].length,
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
  return groupingTs(trace._start).getTime() + '|' + trace.transaction.name + '|' + ancestors + '|' + trace.signature + '|' + trace.type
}
