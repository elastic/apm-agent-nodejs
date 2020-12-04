'use strict'

//
// Internal logging for the Elastic APM Node.js Agent.
//
// Promised interface:
// - The amount of logging can be controlled via the `logLevel` config var,
//   and via the `log_level` central config var.
// - A custom logger can be provided via the `logging` config var.
//
// Nothing else about this package's logging (e.g. structure or the particular
// message text) is promised/stable.
//
// Per https://github.com/elastic/apm/blob/master/specs/agents/logging.md
// the valid log levels are:
//  - trace
//  - debug
//  - info (default)
//  - warning
//  - error
//  - critical
//  - off
//
// Before this spec, the supported levels were:
//  - trace
//  - debug
//  - info (default)
//  - warn - both "warn" and "warning" will be supported for backward compat
//  - error
//  - fatal - mapped to "critical" for backward compat

var consoleLogLevel = require('console-log-level')

const DEFAULT_LOG_LEVEL = 'info'

// Used to mark loggers created here, for use by `isLoggerCustom()`.
const LOGGER_IS_OURS_SYM = Symbol('ElasticAPMLoggerIsOurs')

const LOG_API_LEVEL_FROM_LEVEL_NAME = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  warn: 'warn', // Supported for backwards compat
  error: 'error',
  critical: 'fatal',
  fatal: 'fatal' // Supported for backwards compat
}

const NOOP = function () {}
const NOOP_LOGGER = {
  trace: NOOP,
  debug: NOOP,
  info: NOOP,
  warn: NOOP,
  error: NOOP,
  fatal: NOOP,
  [LOGGER_IS_OURS_SYM]: true,
  level: 'off' // used for testing
}

function createLogger (levelName) {
  if (!levelName) {
    levelName = DEFAULT_LOG_LEVEL
  }

  if (levelName === 'off') {
    return NOOP_LOGGER
  }

  let logApiLevel = LOG_API_LEVEL_FROM_LEVEL_NAME[levelName]
  if (!logApiLevel) {
    // For backwards compat, support an earlier bug where an unknown log level
    // was accepted.
    // TODO: Consider being more strict on this for v4.0.0.
    logApiLevel = 'trace'
  }

  const logger = consoleLogLevel({
    level: logApiLevel
  })
  logger[LOGGER_IS_OURS_SYM] = true // used for isLoggerCustom()
  logger.level = logApiLevel // used for testing

  return logger
}

function isLoggerCustom (logger) {
  return !logger[LOGGER_IS_OURS_SYM]
}

module.exports = {
  DEFAULT_LOG_LEVEL: DEFAULT_LOG_LEVEL,
  createLogger: createLogger,
  isLoggerCustom: isLoggerCustom
}
