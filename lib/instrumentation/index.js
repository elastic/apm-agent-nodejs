'use strict'

var fs = require('fs')
var path = require('path')
var hook = require('require-in-the-middle')
var afterAll = require('after-all')
var stackman = require('stackman')({ filter: '/node_modules/opbeat/' })
var Transaction = require('./transaction')
var Trace = require('./trace')
var debug = require('debug')('opbeat')
var parsers = require('../parsers')
var request = require('../request')

var MODULES = ['http', 'https', 'mongodb-core', 'pg', 'express', 'hapi']
var MAX_QUEUE_SIZE = Infinity
var MAX_SEND_DELAY = 60000
var NODE_VERSION = process.version.slice(1)

module.exports = Instrumentation

function Instrumentation (agent) {
  this._agent = agent
  this._queue = []
}

Instrumentation.prototype.start = function () {
  if (!this._agent.instrument) return

  require('./async-hooks')(this)

  var self = this

  debug('shimming Module._load function')
  hook(MODULES, function (exports, name, basedir) {
    var pkg, version

    if (basedir) {
      pkg = path.join(basedir, 'package.json')
      try {
        version = JSON.parse(fs.readFileSync(pkg)).version
      } catch (e) {
        debug('could not shim %s module: %s', name, e.message)
        return exports
      }
    } else {
      version = NODE_VERSION
    }

    debug('shimming %s@%s module', name, version)
    return require('./modules/' + name)(exports, self._agent, version)
  })
}

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  if (this._agent.instrument) {
    debug('pushing transaction to queue %o', { uuid: transaction._uuid })
    this._queue.push(transaction)
  } else {
    debug('ignoring transaction %o', { uuid: transaction._uuid })
  }
  if (this._queue.length >= MAX_QUEUE_SIZE) this._send()
  else if (this._queue.length && !this._timeout) this._queueSend()
}

Instrumentation.prototype.startTransaction = function (name, type, result) {
  return new Transaction(this._agent, name, type, result)
}

Instrumentation.prototype.endTransaction = function () {
  var trace = this.currentTrace
  if (!trace) return debug('cannot end transaction - no active trace found')
  trace.transaction.end()
}

Instrumentation.prototype.setDefaultTransactionName = function (name) {
  var trace = this.currentTrace
  if (!trace) return debug('no active trace found - cannot set default transaction name')
  trace.transaction.setDefaultName(name)
}

Instrumentation.prototype.setTransactionName = function (name) {
  var trace = this.currentTrace
  if (!trace) return debug('no active trace found - cannot set transaction name')
  trace.transaction.name = name
}

Instrumentation.prototype.buildTrace = function () {
  var transaction = this.currentTrace && this.currentTrace.transaction
  return transaction && !transaction.ended ? new Trace(transaction) : null
}

Instrumentation.prototype._send = function () {
  debug('flushing transaction queue')
  clearTimeout(this._timeout)
  this._timeout = null
  this._flush(function (result) {
    request.transactions(this._agent, result)
  }.bind(this))
}

Instrumentation.prototype._queueSend = function () {
  debug('setting timer to flush transaction queue')
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
    if (!trace._stackObj) return

    var done = next()
    traceFrames(trace, function (frames) {
      if (frames) groups[index].extra._frames = frames.reverse()
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
      extra: trace.extra
    }
  })
}

function traceFrames (trace, cb) {
  if (trace._stackObj.frames) return process.nextTick(cb.bind(null, trace._stackObj.frames))
  stackman(trace._stackObj.err, function (stack) {
    if (!stack.frames) {
      debug('could not capture stack trace for trace %o', { uuid: trace.transaction.uuid, signature: trace.signature, type: trace.type })
      cb()
      return
    }
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
