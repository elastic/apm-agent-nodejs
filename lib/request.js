'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var util = require('util')
var debug = require('debug')('opbeat')
var trunc = require('unicode-byte-truncate')

var GENERIC_PLATFORM_HEADER = util.format('lang=node/%s platform=%s os=%s',
    process.versions.node,
    process.release ? process.release.name : 'node',
    process.platform)

var request = function (agent, endpoint, payload, cb) {
  if (!agent.active) {
    // failsafe - we should never reach this point
    debug('request attempted on an inactive agent - ignoring!')
    return
  }

  var headers = {
    'X-Opbeat-Platform': GENERIC_PLATFORM_HEADER + (agent._platform.framework
      ? util.format(' framework=%s/%s', agent._platform.framework.name, agent._platform.framework.version)
      : '')
  }

  if (process.env.OPBEAT_DEBUG_PAYLOAD) capturePayload(endpoint, payload)

  agent._httpClient.request(endpoint, headers, payload, function (err, res, body) {
    if (err) return cb(err)
    if (res.statusCode < 200 || res.statusCode > 299) {
      var msg = util.format('Opbeat error (%d): %s', res.statusCode, body)
      cb(new Error(msg))
      return
    }
    cb(null, res.headers.location)
  })
}

exports.error = function (agent, payload, cb) {
  truncErrorPayload(payload)

  request(agent, 'errors', payload, function (err, url) {
    var uuid = payload.extra && payload.extra.uuid
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err, uuid)
      return
    }
    if (cb) cb(null, url)
    agent.emit('logged', url, uuid)
  })
}

exports.transactions = function (agent, payload, cb) {
  filterTransactionPayload(payload, agent._filters)
  truncTransactionPayload(payload)

  debug('sending transactions to intake api')
  request(agent, 'transactions', payload, function (err) {
    if (err) {
      if (cb) cb(err)
      agent.emit('error', err)
      return
    }
    debug('logged transactions successfully')
  })
}

function filterTransactionPayload (payload, filters) {
  payload.traces.raw.forEach(function (raw) {
    var context = raw[raw.length - 1]
    context = filters.process(context)
    if (!context) raw.pop()
    else raw[raw.length - 1] = context
  })
}

function truncErrorPayload (payload) {
  if (payload.stacktrace && payload.stacktrace.frames) {
    payload.stacktrace.frames = truncFrames(payload.stacktrace.frames)
  }

  if (payload.exception && payload.exception.value) {
    payload.exception.value = trunc(String(payload.exception.value), 2048)
  }

  if (payload.culprit) {
    payload.culprit = trunc(String(payload.culprit), 100)
  }

  if (payload.message) {
    payload.message = trunc(String(payload.message), 200)
  }
}

function truncTransactionPayload (payload) {
  if (payload.transactions) {
    payload.transactions.forEach(function (trans) {
      trans.transaction = trunc(String(trans.transaction), 512)
    })
  }

  if (payload.traces && payload.traces.groups) {
    payload.traces.groups.forEach(function (group) {
      if (group.transaction) group.transaction = trunc(String(group.transaction), 512)
      if (group.signature) group.signature = trunc(String(group.signature), 512)
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

// Used only for debugging data sent to the intake API
function capturePayload (endpoint, payload) {
  var dumpfile = path.join(os.tmpdir(), 'opbeat-' + endpoint + '-' + Date.now() + '.json')
  fs.writeFile(dumpfile, JSON.stringify(payload), function (err) {
    if (err) debug('could not capture intake payload: %s', err.message)
    else debug('intake payload captured: %s', dumpfile)
  })
}
