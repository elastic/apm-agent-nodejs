'use strict'

var truncate = require('unicode-byte-truncate')

var config = require('./config')

exports.transaction = truncTransaction
exports.span = truncSpan
exports.error = truncError

function truncTransaction (trans) {
  trans.name = truncate(String(trans.name), config.INTAKE_STRING_MAX_SIZE)
  trans.type = truncate(String(trans.type), config.INTAKE_STRING_MAX_SIZE)
  trans.result = truncate(String(trans.result), config.INTAKE_STRING_MAX_SIZE)

  // Unless sampled, context will be null
  if (trans.sampled) truncContext(trans.context)
}

function truncSpan (span) {
  span.name = truncate(String(span.name), config.INTAKE_STRING_MAX_SIZE)
  span.type = truncate(String(span.type), config.INTAKE_STRING_MAX_SIZE)
  if (span.stacktrace) span.stacktrace = truncFrames(span.stacktrace)
}

function truncError (error, conf) {
  if (error.log) {
    if (error.log.level) {
      error.log.level = truncate(String(error.log.level), config.INTAKE_STRING_MAX_SIZE)
    }
    if (error.log.logger_name) {
      error.log.logger_name = truncate(String(error.log.logger_name), config.INTAKE_STRING_MAX_SIZE)
    }
    if (error.log.message && conf.errorMessageMaxLength >= 0) {
      error.log.message = truncate(String(error.log.message), conf.errorMessageMaxLength)
    }
    if (error.log.param_message) {
      error.log.param_message = truncate(String(error.log.param_message), config.INTAKE_STRING_MAX_SIZE)
    }
    if (error.log.stacktrace) {
      error.log.stacktrace = truncFrames(error.log.stacktrace)
    }
  }

  if (error.exception) {
    if (error.exception.message && conf.errorMessageMaxLength >= 0) {
      error.exception.message = truncate(String(error.exception.message), conf.errorMessageMaxLength)
    }
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
