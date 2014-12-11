'use strict';

var logger = require('../lib/logger');

var _oldConsoleInfo = logger.info;
var _oldConsoleWarn = logger.warn;
var _oldConsoleError = logger.error;

exports.mockLogger = function () {
  logger.info = function () { logger.info._called = true; };
  logger.warn = function () { logger.warn._called = true; };
  logger.error = function () { logger.error._called = true; };
  logger.info._called = false;
  logger.warn._called = false;
  logger.error._called = false;
};

exports.restoreLogger = function () {
  logger.info = _oldConsoleInfo;
  logger.warn = _oldConsoleWarn;
  logger.error = _oldConsoleError;
};
