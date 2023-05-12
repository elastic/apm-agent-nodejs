/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

/**
 * @typedef {object} LogEntry
 * @property {string} type
 * @property {string} message
 * @property {Array<any>} message
 */

/**
 * SomeClass is an example class for my question.
 * @class
 * @constructor
 * @public
 */
class MockLogger {
  constructor () {
    /**
     * someProperty is an example property that is set to `true`
     * @type {Array<LogEntry>}
     * @public
     */
    this.calls = []
  }

  _log (type, message, interpolation) {
    this.calls.push({
      type,
      message,
      interpolation
    })
  }

  fatal () { this._log('fatal', arguments[0], [].slice.call(arguments, 1)) }
  error () { this._log('error', arguments[0], [].slice.call(arguments, 1)) }
  warn () { this._log('warn', arguments[0], [].slice.call(arguments, 1)) }
  info () { this._log('info', arguments[0], [].slice.call(arguments, 1)) }
  debug () { this._log('debug', arguments[0], [].slice.call(arguments, 1)) }
  trace () { this._log('trace', arguments[0], [].slice.call(arguments, 1)) }
}

module.exports = MockLogger
