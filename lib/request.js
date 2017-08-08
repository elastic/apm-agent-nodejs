'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var util = require('util')
var debug = require('debug')('elastic-apm')
var trunc = require('unicode-byte-truncate')
var logger = require('./logger')

var AGENT_VERSION = require('../package').version
var OS_HOSTNAME = os.hostname()
var GENERIC_PLATFORM_HEADER = util.format('lang=node/%s platform=%s os=%s',
    process.versions.node,
    process.release ? process.release.name : 'node',
    process.platform)

exports.errors = sendErrors
exports.transactions = sendTransactions
exports._envelope = envelope // Expose for testing only

var request = function (agent, endpoint, payload, cb) {
  if (!agent.active) return cb()

  var headers = {
    'X-Elastic-APM-Platform': GENERIC_PLATFORM_HEADER + (agent._platform.framework
      ? util.format(' framework=%s/%s', agent._platform.framework.name, agent._platform.framework.version)
      : '')
  }

  if (process.env.ELASTIC_APM_DEBUG_PAYLOAD) capturePayload(endpoint, payload)

  debug('sending %s payload', endpoint)
  agent._httpClient.request(endpoint, headers, payload, function (err, res, body) {
    if (err) {
      logger.error(err.stack)
    } else if (res.statusCode < 200 || res.statusCode > 299) {
      // TODO: Parse error JSON body
      logger.error('Elastic APM HTTP error (%d): %s', res.statusCode, body)
    } else {
      debug('%s payload successfully sent', endpoint)
    }
    cb()
  })
}

function sendErrors (agent, errors, cb) {
  var payload = envelope(agent)
  payload.errors = errors
  payload = agent._filters.process(payload)

  if (!payload || payload.errors.length === 0) {
    logger.debug('Errors not sent to Elastic APM - Ignored by filter')
    cb()
    return
  }

  truncErrorsPayload(payload)

  request(agent, 'errors', payload, cb)
}

function sendTransactions (agent, transactions, cb) {
  var payload = envelope(agent)
  payload.transactions = transactions
  payload = agent._filters.process(payload)

  if (!payload || payload.transactions.length === 0) {
    logger.debug('Transactions not sent to Elastic APM - Ignored by filter')
    cb()
    return
  }

  truncTransactionPayload(payload)

  request(agent, 'transactions', payload, cb)
}

// TODO: Reconsider truncation limits
function truncErrorsPayload (payload) {
  payload.errors.forEach(function (error) {
    if (error.culprit) {
      error.culprit = trunc(String(error.culprit), 100)
    }

    if (error.log) {
      if (error.log.message) {
        error.log.message = trunc(String(error.log.message), 2048)
      }
      if (error.log.stacktrace) {
        error.log.stacktrace = truncFrames(error.log.stacktrace)
      }
    }

    if (error.exception) {
      if (error.exception.message) {
        error.exception.message = trunc(String(error.exception.message), 200)
      }
      if (error.exception.stacktrace) {
        error.exception.stacktrace = truncFrames(error.exception.stacktrace)
      }
    }
  })
}

// TODO: Reconsider truncation limits
function truncTransactionPayload (payload) {
  payload.transactions.forEach(function (trans) {
    trans.name = trunc(String(trans.name), 512)

    trans.traces.forEach(function (trace) {
      trace.name = trunc(String(trace.name), 512)
      if (trace.stacktrace) trace.stacktrace = truncFrames(trace.stacktrace)
    })
  })
}

// TODO: Reconsider truncation limits
function truncFrames (frames) {
  // max 300 stack frames
  if (frames.length > 300) {
    frames = frames.slice(0, 300)
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
  var dumpfile = path.join(os.tmpdir(), 'elastic-apm-' + endpoint + '-' + Date.now() + '.json')
  fs.writeFile(dumpfile, JSON.stringify(payload), function (err) {
    if (err) debug('could not capture intake payload: %s', err.message)
    else debug('intake payload captured: %s', dumpfile)
  })
}

function envelope (agent) {
  var payload = {
    app: {
      name: agent.appName,
      pid: process.pid,
      process_title: process.title,
      argv: process.argv,
      runtime: {
        name: (process.release && process.release.name) || process.argv[0], // process.release was introduced in v3.0.0
        version: process.version
      },
      agent: {
        name: 'nodejs',
        version: AGENT_VERSION
      }
    },
    system: {
      hostname: OS_HOSTNAME,
      architecture: process.arch,
      platform: process.platform
    }
  }

  if (agent._platform.framework) {
    payload.app.framework = {
      name: agent._platform.framework.name,
      version: agent._platform.framework.version
    }
  }

  return payload
}
