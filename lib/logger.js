'use strict'

var ConsoleLogLevel = require('console-log-level')

exports.init = function (opts) {
  var logger = ConsoleLogLevel(opts)
  Object.keys(logger).forEach(function (method) {
    exports[method] = function () {
      return logger[method].apply(logger, arguments)
    }
  })
}
