'use strict'

var Logger = require('console-log-level')

exports.init = function (opts) {
  var logger = Logger(opts)
  Object.keys(logger).forEach(function (method) {
    exports[method] = function () {
      return logger[method].apply(logger, arguments)
    }
  })
}
