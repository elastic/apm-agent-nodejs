/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const { levels, pino } = require('pino');

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
  constructor() {
    /**
     * someProperty is an example property that is set to `true`
     * @type {Array<LogEntry>}
     * @public
     */
    this.calls = [];
  }

  /**
   * @private
   * @param {String} type
   * @param {Array<any>} loggerArgs
   */
  _log(type, loggerArgs) {
    const args = [].slice.call(loggerArgs);
    const hasMergingObject = typeof args[0] === 'object';
    const mergingObject = hasMergingObject ? args[0] : null;
    const message = hasMergingObject ? args[1] : args[0];
    const interpolation = args.slice(hasMergingObject ? 2 : 1);

    this.calls.push({
      type,
      mergingObject,
      message,
      interpolation,
    });
  }

  fatal() {
    this._log('fatal', arguments);
  }
  error() {
    this._log('error', arguments);
  }
  warn() {
    this._log('warn', arguments);
  }
  info() {
    this._log('info', arguments);
  }
  debug() {
    this._log('debug', arguments);
  }
  trace() {
    this._log('trace', arguments);
  }
}

/**
 * Returns a logger which stores the log data into the given array
 *
 * @param {Array<Object>} calls Array where to put the logs to inspect later
 */
function createMockLogger(calls) {
  if (!Array.isArray(calls)) {
    throw new Error('Calls parameter must be an array to create a mock logger');
  }

  return pino(
    { name: 'mock-logger' },
    {
      // The message received is a serialized object with is a merge of
      // - the log level (`level` property) with its numeric value (eg. INFO === 30)
      // - the log message (`msg` property) with the interpolated values
      // - the logger name (`name` property) with the value `mock-logger`
      // - all props of mergingObject if it was passed. See https://getpino.io/#/docs/api?id=logging-method-parameters
      write: function (logMsg) {
        const logObj = JSON.parse(logMsg);
        const logMessage = logObj.msg;
        const levelValue = logObj.level;
        const levelName = Object.keys(levels.values).find(
          (key) => levels.values[key] === levelValue,
        );

        delete logObj.msg;
        delete logObj.level;
        calls.push({
          type: levelName,
          mergingObject: logObj,
          message: logMessage,
        });
      },
    },
  );
}

module.exports = {
  createMockLogger,
  MockLogger,
};
