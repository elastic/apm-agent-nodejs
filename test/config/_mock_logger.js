/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

/**
 * @typedef {Object} LogEntry
 * @property {String} type
 * @property {String} mergingObject
 * @property {String} message
 * @property {Array<any>} interpolation
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

  /**
   * @private
   * @param {String} type
   * @param {Array<any>} loggerArgs
   */
  _log (type, loggerArgs) {
    const args = [].slice.call(loggerArgs)
    const hasMergingObject = typeof args[0] === 'object'
    const mergingObject = hasMergingObject ? args[0] : null
    const message = hasMergingObject ? args[1] : args[0]
    const interpolation = args.slice(hasMergingObject ? 2 : 1)

    this.calls.push({
      type,
      mergingObject,
      message,
      interpolation
    })
  }

  fatal () { this._log('fatal', arguments) }
  error () { this._log('error', arguments) }
  warn () { this._log('warn', arguments) }
  info () { this._log('info', arguments) }
  debug () { this._log('debug', arguments) }
  trace () { this._log('trace', arguments) }
}

module.exports = MockLogger
