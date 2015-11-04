'use strict'

var shimmer = require('shimmer')
var afterAll = require('after-all')
var stackman = require('stackman')({ filter: '/node_modules/opbeat/' })
var modules = require('./modules')
var Transaction = require('./transaction')
var parsers = require('../parsers')
var request = require('../request')

var MAX_QUEUE_SIZE = Infinity
var MAX_SEND_DELAY = 60000

var Instrumentation = module.exports = function (agent) {
  if (!(this instanceof Instrumentation)) return new Instrumentation(agent)
  this._agent = agent
  this._queue = []

  if (!this._agent._ff_instrument || !this._agent.active) return

  shimmer({ logger: this._agent.logger.error })
  require('./async-hooks')(this._agent)

  this._agent.logger.trace('shimming function Module._load')

  var Module = require('module')
  shimmer.wrap(Module, '_load', function (orig) {
    return function (file) {
      return modules.patch(file, orig.apply(this, arguments), agent)
    }
  })
}

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  if (this._agent.active && this._agent._ff_instrument) {
    this._agent.logger.trace('[%s] pushing transaction to queue', transaction._uuid)
    this._queue.push(transaction)
  } else {
    this._agent.logger.trace('[%s] ignoring transaction', transaction._uuid)
  }
  if (this._queue.length >= MAX_QUEUE_SIZE) this._send()
  else if (this._queue.length && !this._timeout) this._queueSend()
}

Instrumentation.prototype.startTransaction = function (name, type, result) {
  return new Transaction(this._agent, name, type, result)
}

Instrumentation.prototype.endTransaction = function () {
  var trans = this.currentTransaction
  if (!trans) return this._agent.logger.warn('cannot end transaction - no transaction found')
  trans.end()
}

Instrumentation.prototype.setTransactionName = function (name) {
  var trans = this.currentTransaction
  if (!trans) return this._agent.logger.warn('no transaction found - cannot set name')
  trans.name = name
}

Instrumentation.prototype.activeTransaction = function () {
  var trans = this.currentTransaction
  if (trans && !trans.ended) return trans
}

Instrumentation.prototype._send = function () {
  this._agent.logger.trace('flushing transaction queue')
  clearTimeout(this._timeout)
  this._timeout = null
  this._flush(function (result) {
    request.transactions(this._agent, result)
  }.bind(this))
}

Instrumentation.prototype._queueSend = function () {
  this._agent.logger.trace('setting timer to flush transaction queue')
  this._timeout = setTimeout(this._send.bind(this), MAX_SEND_DELAY)
  this._timeout.unref()
}

Instrumentation.prototype._flush = function (cb) {
  var transactions = groupTransactions(this._queue)
  var traces = [].concat.apply([], this._queue.map(function (trans) {
    return trans.traces
  }))
  var groups = groupTraces(traces)
  var raw = rawTransactions(this._queue)
  this._queue = []

  addStackTracesToTraceGroups(groups, traces, function () {
    cb({
      transactions: transactions,
      traces: {
        groups: groups,
        raw: raw
      }
    })
  })
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
  return transactions
    .map(function (trans) {
      if (trans.traces.length === 0) return
      return [trans.duration()].concat(rawTraces(trans.traces))
    })
    .filter(function (elm) {
      return !!elm
    })
}

function rawTraces (traces) {
  return traces.map(function (trace) {
    return [trace._groupIndex, trace.startTime(), trace.duration()]
  })
}

function addStackTracesToTraceGroups (groups, traces, cb) {
  var processed = []
  var next = afterAll(cb)
  traces.forEach(function (trace) {
    var index = trace._groupIndex
    if (~processed.indexOf(index)) return
    processed.push(index)
    var done = next()
    traceFrames(trace, function (frames) {
      groups[index].extra._frames = frames
      done()
    })
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
      parents: trace.ancestors(),
      extra: trace.extra || {}
    }
  })
}

function traceFrames (trace, cb) {
  if (trace._stackObj.frames) return process.nextTick(cb.bind(null, trace._stackObj.frames))
  stackman(trace._stackObj.err, function (stack) {
    var frames = stack.frames.map(parsers.parseCallsite)
    trace._stackObj.frames = frames
    cb(frames)
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
  var ancestors = trace.ancestors().map(function (trace) { return trace.signature }).join('|')
  return groupingTs(trace.transaction._start).getTime() + '|' + trace.transaction.name + '|' + ancestors + '|' + trace.signature
}
