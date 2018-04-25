'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')

var truncate = require('unicode-byte-truncate')

var config = require('./config')

var AGENT_VERSION = require('../package').version
var noop = function () {}

exports.errors = sendErrors
exports.transactions = sendTransactions
exports._envelope = envelope // Expose for testing only

var request = function (agent, endpoint, payload, cb) {
  if (!agent._conf.active) return cb()

  if (process.env.DEBUG_PAYLOAD) capturePayload(endpoint, payload)

  agent.logger.debug('sending %s payload', endpoint)
  agent._httpClient.request(endpoint, {}, payload, function (err, res, body) {
    if (err) {
      agent.logger.error(err.stack)
    } else if (res.statusCode < 200 || res.statusCode > 299) {
      var errorMsg = body
      if (res.headers['content-type'] === 'application/json') {
        try {
          errorMsg = JSON.parse(body).error || body
        } catch (e) {
          agent.logger.error('Error parsing JSON error response from APM Server: %s', e.message)
        }
      }
      // TODO: The error messages returned by the APM Server will most likely
      // contain line-breaks. Consider if we actually want to output it as one
      // line (less readable, but easier to process by a machine), or if we
      // should output it like today where we just use the line-breaks given to
      // us
      agent.logger.error('Elastic APM HTTP error (%d): %s', res.statusCode, errorMsg)
    } else {
      agent.logger.debug('%s payload successfully sent', endpoint)
    }
    cb(err)
  })
}

function sendErrors (agent, errors, cb) {
  cb = cb || noop
  var payload = envelope(agent)
  payload.errors = errors
  payload = agent._filters.process(payload)

  if (!payload || payload.errors.length === 0) {
    agent.logger.debug('Errors not sent to Elastic APM - Ignored by filter')
    cb()
    return
  }

  truncErrorsPayload(payload)

  request(agent, 'errors', payload, cb)
}

function sendTransactions (agent, transactions, cb) {
  cb = cb || noop
  var payload = envelope(agent)
  payload.transactions = transactions
  payload = agent._filters.process(payload)

  if (!payload || payload.transactions.length === 0) {
    agent.logger.debug('Transactions not sent to Elastic APM - Ignored by filter')
    cb()
    return
  }

  truncTransactionPayload(payload)

  request(agent, 'transactions', payload, cb)
}

function truncErrorsPayload (payload) {
  payload.errors.forEach(function (error) {
    if (error.log) {
      if (error.log.level) {
        error.log.level = truncate(String(error.log.level), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.logger_name) {
        error.log.logger_name = truncate(String(error.log.logger_name), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.param_message) {
        error.log.param_message = truncate(String(error.log.param_message), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.log.stacktrace) {
        error.log.stacktrace = truncFrames(error.log.stacktrace)
      }
    }

    if (error.exception) {
      if (error.exception.type) {
        error.exception.type = truncate(String(error.exception.type), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.exception.code) {
        error.exception.code = truncate(String(error.exception.code), config.INTAKE_STRING_MAX_SIZE)
      }
      if (error.exception.module) {
        error.exception.module = truncate(String(error.exception.module), config.INTAKE_STRING_MAX_SIZE)
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
    trans.name = truncate(String(trans.name), config.INTAKE_STRING_MAX_SIZE)
    trans.type = truncate(String(trans.type), config.INTAKE_STRING_MAX_SIZE)
    trans.result = truncate(String(trans.result), config.INTAKE_STRING_MAX_SIZE)

    // Unless sampled, spans and context will be null
    if (trans.sampled) {
      trans.spans.forEach(function (span) {
        span.name = truncate(String(span.name), config.INTAKE_STRING_MAX_SIZE)
        span.type = truncate(String(span.type), config.INTAKE_STRING_MAX_SIZE)
        if (span.stacktrace) span.stacktrace = truncFrames(span.stacktrace)
      })
      truncContext(trans.context)
    }
  })
}

function truncContext (context) {
  if (!context) return

  if (context.request) {
    if (context.request.method) {
      context.request.method = truncate(String(context.request.method), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.request.url) {
      if (context.request.url.protocol) {
        context.request.url.protocol = truncate(String(context.request.url.protocol), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.hostname) {
        context.request.url.hostname = truncate(String(context.request.url.hostname), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.port) {
        context.request.url.port = truncate(String(context.request.url.port), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.pathname) {
        context.request.url.pathname = truncate(String(context.request.url.pathname), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.search) {
        context.request.url.search = truncate(String(context.request.url.search), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.hash) {
        context.request.url.hash = truncate(String(context.request.url.hash), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.raw) {
        context.request.url.raw = truncate(String(context.request.url.raw), config.INTAKE_STRING_MAX_SIZE)
      }
      if (context.request.url.full) {
        context.request.url.full = truncate(String(context.request.url.full), config.INTAKE_STRING_MAX_SIZE)
      }
    }
  }
  if (context.user) {
    if (context.user.id) {
      context.user.id = truncate(String(context.user.id), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.user.email) {
      context.user.email = truncate(String(context.user.email), config.INTAKE_STRING_MAX_SIZE)
    }
    if (context.user.username) {
      context.user.username = truncate(String(context.user.username), config.INTAKE_STRING_MAX_SIZE)
    }
  }
}

function truncFrames (frames) {
  frames.forEach(function (frame, i) {
    if (frame.pre_context) frame.pre_context = truncEach(frame.pre_context, 1000)
    if (frame.context_line) frame.context_line = truncate(String(frame.context_line), 1000)
    if (frame.post_context) frame.post_context = truncEach(frame.post_context, 1000)
  })

  return frames
}

function truncEach (arr, len) {
  return arr.map(function (str) {
    return truncate(String(str), len)
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
    service: {
      name: agent._conf.serviceName,
      runtime: {
        name: process.release.name,
        version: process.version
      },
      language: {
        name: 'javascript'
      },
      agent: {
        name: 'nodejs',
        version: AGENT_VERSION
      }
    },
    process: {
      pid: process.pid,
      ppid: process.ppid,
      title: truncate(String(process.title), config.INTAKE_STRING_MAX_SIZE),
      argv: process.argv
    },
    system: {
      hostname: agent._conf.hostname,
      architecture: process.arch,
      platform: process.platform
    }
  }

  if (agent._conf.serviceVersion) payload.service.version = agent._conf.serviceVersion

  if (agent._conf.frameworkName || agent._conf.frameworkVersion) {
    payload.service.framework = {
      name: agent._conf.frameworkName,
      version: agent._conf.frameworkVersion
    }
  }

  return payload
}
