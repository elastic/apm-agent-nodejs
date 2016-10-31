'use stirct'

var afterAll = require('after-all')
var stackman = require('stackman')({ filter: '/node_modules/opbeat/' })
var knownGroupingKeys = require('lru-cache')({ max: 5000 })
var debug = require('debug')('opbeat')
var parsers = require('../parsers')

exports.encode = function (transactions, cb) {
  var groupedTransactions = groupTransactions(transactions)
  var traces = [].concat.apply([], transactions.map(function (trans) {
    return trans.traces
  }))
  var groups = groupTraces(traces)
  var raw = rawTransactions(transactions)

  addStackTracesToTraceGroups(groups, traces, function () {
    cb({
      transactions: groupedTransactions,
      traces: {
        groups: groups,
        raw: raw
      }
    })
  })
}

function groupTransactions (transactions) {
  var groups = groupByKey(transactions, transactionGroupingKey)

  return Object.keys(groups).map(function (key) {
    var trans = groups[key][0] // a transaction to represent this group
    var durations = groups[key].map(function (trans) {
      return trans.duration()
    })
    return {
      transaction: trans.name,
      result: trans.result,
      kind: trans.type,
      timestamp: new Date(groupingTs(trans._start)).toISOString(),
      durations: durations
    }
  })
}

function groupTraces (traces) {
  var groups = groupByKey(traces, traceGroupingKey)

  return Object.keys(groups).map(function (key, index) {
    var trace = groups[key][0] // a trace to represent this group
    groups[key].forEach(function (trace) {
      trace._groupIndex = index
    })
    return {
      transaction: trace.transaction.name,
      signature: trace.signature,
      kind: trace.type,
      timestamp: new Date(groupingTs(trace._start)).toISOString(),
      parents: trace.ancestors(),
      extra: trace.extra
    }
  })
}

function rawTransactions (transactions) {
  var raw = []
  transactions.forEach(function (trans) {
    if (trans.traces.length === 0) return
    raw.push([trans.duration()].concat(rawTraces(trans.traces)))
  })
  return raw
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

    var key = stackTraceGroupingKey(trace)
    if (knownGroupingKeys.get(key)) return
    knownGroupingKeys.set(key, true)

    var done = next()
    traceFrames(trace, function (frames) {
      if (frames) groups[index].extra._frames = frames.reverse()
      done()
    })
  })
}

function traceFrames (trace, cb) {
  if (trace._stackObj.frames) {
    process.nextTick(function () {
      cb(trace._stackObj.frames)
    })
    return
  }

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

/**
 * Group an array (arr) of objects using the given grouping function (grouper).
 *
 * Only requirement is that the grouping function - given an object - returns a
 * key that should be used to group that object.
 *
 * Returns an object where each key represents a group. Each value in the
 * object is an array containing the objects that fall into that group.
 */
function groupByKey (arr, grouper) {
  var groups = {}

  arr.forEach(function (obj) {
    var key = grouper(obj)
    if (key in groups) groups[key].push(obj)
    else groups[key] = [obj]
  })

  return groups
}

function transactionGroupingKey (trans) {
  return groupingTs(trans._start) +
    '|' + trans.name +
    '|' + trans.result +
    '|' + trans.type
}

function traceGroupingKey (trace) {
  return groupingTs(trace.transaction._start) +
    '|' + trace.transaction.name +
    '|' + trace.ancestors().join('|') +
    '|' + trace.signature
}

function stackTraceGroupingKey (trace) {
  return trace.type +
    '|' + trace.signature +
    '|' + trace.transaction.name +
    '|' + trace.ancestors().join('|')
}

/**
 * Convert a number representing the milliseconds elapsed since the UNIX epoch
 * to whole minutes.
 *
 * Or in other words it converts:
 *   2016-10-23T15:23:53.345Z
 * To:
 *   2016-10-23T15:23:00.000Z
 */
function groupingTs (ms) {
  return Math.floor(ms / 1000 / 60) * 1000 * 60
}
