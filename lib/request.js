'use strict'

var util = require('util')
var debug = require('debug')('opbeat')
var trunc = require('unicode-byte-truncate')

var request = function (agent, endpoint, data, cb) {
  if (!agent.active) {
    // failsafe - we should never reach this point
    debug('request attempted on an inactive agent - ignoring!')
    return
  }

  agent._httpClient.request(endpoint, data, function (err, res, body) {
    if (err) return cb(err)
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      cb(new Error(msg))
      return
    }
    cb(null, res.headers.location)
  })
}

exports.error = function (agent, data, cb) {
  truncErrorData(data)

  request(agent, 'errors', data, function (err, url) {
    var uuid = data.extra && data.extra.uuid
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err, uuid)
      return
    }
    if (cb) cb(null, url)
    agent.emit('logged', url, uuid)
  })
}

exports.transactions = function (agent, data, cb) {
  truncTransactionData(data)

  request(agent, 'transactions', data, function (err) {
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err)
      return
    }
    debug('logged transactions successfully')
  })
}

function truncErrorData (data) {
  if (data.stacktrace && data.stacktrace.frames) {
    data.stacktrace.frames = truncFrames(data.stacktrace.frames)
  }

  if (data.exception && data.exception.value) {
    data.exception.value = trunc(String(data.exception.value), 2048)
  }

  if (data.culprit) {
    data.culprit = trunc(String(data.culprit), 100)
  }

  if (data.message) {
    data.message = trunc(String(data.message), 200)
  }
}

function truncTransactionData (data) {
  if (data.transactions) {
    data.transactions.forEach(function (trans) {
      trans.transaction = trunc(String(trans.transaction), 512)
    })
  }

  if (data.traces && data.traces.groups) {
    data.traces.groups.forEach(function (group) {
      if (group.transaction) group.transaction = trunc(String(group.transaction), 512)
      if (group.extra && group.extra._frames) group.extra._frames = truncFrames(group.extra._frames)
    })
  }
}

function truncFrames (frames) {
  // max 300 stack frames
  if (frames.length > 300) {
    // frames are reversed to match API requirements
    frames = frames.slice(-300)
  }

  // each line in stack trace must not exeed 1000 chars
  frames.forEach(function (frame, i) {
    if (frame.pre_context) frame.pre_context = truncEach(frame.pre_context, 1000)
    if (frame.context_line) frame.context_line = trunc(String(frame.context_line), 1000)
    if (frame.post_context) frame.post_context = truncEach(frame.post_context, 1000)
  })

  return frames
}

function truncEach (arr, len) {
  return arr.map(function (str) {
    return trunc(String(str), len)
  })
}
