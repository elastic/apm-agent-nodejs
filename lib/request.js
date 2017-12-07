'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')
var debug = require('debug')('elastic-apm')
var trunc = require('unicode-byte-truncate')
var logger = require('./logger')
var config = require('./config')

var AGENT_VERSION = require('../package').version
var noop = function () {}

exports.errors = sendErrors
exports.transactions = sendTransactions
exports._envelope = envelope // Expose for testing only

var request = function (agent, endpoint, payload, cb) {
  if (!agent.active) return cb()

  if (process.env.DEBUG_PAYLOAD) capturePayload(endpoint, payload)

  debug('sending %s payload', endpoint)
  agent._httpClient.request(endpoint, {}, payload, function (err, res, body) {
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
  cb = cb || noop
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

function sendTransactions (agent, transactions) {
  var payload = envelope(agent)
  payload.transactions = transactions
  payload = agent._filters.process(payload)

  if (!payload || payload.transactions.length === 0) {
    logger.debug('Transactions not sent to Elastic APM - Ignored by filter')
    return
  }

  truncTransactionPayload(payload)

  request(agent, 'transactions', payload, noop)
}

function truncErrorsPayload (payload) {
  payload.errors.forEach(function (error) {
    if (error.log) {
      if (error.log.level) {
        error.log.level = trunc(String(error.log.level), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.logger_name) {
        error.log.logger_name = trunc(String(error.log.logger_name), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.param_message) {
        error.log.param_message = trunc(String(error.log.param_message), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.stacktrace) {
        error.log.stacktrace = truncFrames(error.log.stacktrace)
      }
    }

    if (error.exception) {
      if (error.exception.type) {
        error.exception.type = trunc(String(error.exception.type), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.exception.code) {
        error.exception.code = trunc(String(error.exception.code), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.exception.module) {
        error.exception.module = trunc(String(error.exception.module), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.exception.stacktrace) {
        error.exception.stacktrace = truncFrames(error.exception.stacktrace)
      }
    }

    truncContext(error.context)
  })
}

function truncTransactionPayload (payload) {
  payload.transactions.forEach(function (trans) {
    trans.name = trunc(String(trans.name), config.INTAKE_STRING_MAX_SIZE)
    trans.type = trunc(String(trans.type), config.INTAKE_STRING_MAX_SIZE)
    trans.result = trunc(String(trans.result), config.INTAKE_STRING_MAX_SIZE)

    trans.spans.forEach(function (span) {
      span.name = trunc(String(span.name), config.INTAKE_STRING_MAX_SIZE)
      span.type = trunc(String(span.type), config.INTAKE_STRING_MAX_SIZE)
      if (span.stacktrace) span.stacktrace = truncFrames(span.stacktrace)
    })

    truncContext(trans.context)
  })
}

function truncContext (context) {
  if (!context) return

  if (context.request) {
    if (context.request.method) {
      context.request.method = trunc(String(context.request.method), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.request.url) {
      if (context.request.url.protocol) {
        context.request.url.protocol = trunc(String(context.request.url.protocol), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.hostname) {
        context.request.url.hostname = trunc(String(context.request.url.hostname), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.port) {
        context.request.url.port = trunc(String(context.request.url.port), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.pathname) {
        context.request.url.pathname = trunc(String(context.request.url.pathname), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.search) {
        context.request.url.search = trunc(String(context.request.url.search), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.hash) {
        context.request.url.hash = trunc(String(context.request.url.hash), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.raw) {
        context.request.url.raw = trunc(String(context.request.url.raw), config.INTAKE_STRING_MAX_SIZE)
      }
    }
  }
  if (context.user) {
    if (context.user.id) {
      context.user.id = trunc(String(context.user.id), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.user.email) {
      context.user.email = trunc(String(context.user.email), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.user.username) {
      context.user.username = trunc(String(context.user.username), config.INTAKE_STRING_MAX_SIZE)
    }
  }
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
  var dumpfile = path.join(os.tmpdir(), 'elastic-apm-node-' + endpoint + '-' + Date.now() + '.json')
  fs.writeFile(dumpfile, JSON.stringify(payload), function (err) {
    if (err) console.log('could not capture intake payload: %s', err.message)
    else console.log('intake payload captured: %s', dumpfile)
  })
}

function envelope (agent) {
  var payload = {
    app: {
      name: agent.appName,
      pid: process.pid,
      process_title: trunc(String(process.title), config.INTAKE_STRING_MAX_SIZE),
      argv: process.argv,
      runtime: {
        name: trunc(String((process.release && process.release.name) || process.argv[0]), config.INTAKE_STRING_MAX_SIZE), // process.release was introduced in v3.0.0
        version: trunc(String(process.version), config.INTAKE_STRING_MAX_SIZE)
      },
      language: {
        name: 'javascript'
      },
      agent: {
        name: 'nodejs',
        version: AGENT_VERSION
      }
    },
    system: {
      hostname: agent.hostname,
      architecture: trunc(String(process.arch), config.INTAKE_STRING_MAX_SIZE),
      platform: trunc(String(process.platform), config.INTAKE_STRING_MAX_SIZE)
    }
  }

  if (agent.appVersion) payload.app.version = agent.appVersion

  if (agent._platform.framework) {
    payload.app.framework = {
      name: agent._platform.framework.name,
      version: agent._platform.framework.version
    }
  }

  return payload
}
