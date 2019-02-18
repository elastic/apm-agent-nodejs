'use strict'

var isError = require('core-util-is').isError

var symbols = require('../../symbols')

function shouldReport (err) {
  if (typeof err === 'string') return true
  if (isError(err) && !err[symbols.errorReportedSymbol]) {
    err[symbols.errorReportedSymbol] = true
    return true
  }
  return false
}

module.exports = function (finalhandler, agent) {
  return function wrappedFinalhandler (req, res, options) {
    var final = finalhandler.apply(this, arguments)

    return function (err) {
      if (shouldReport(err)) {
        agent.captureError(err, { request: req })
      }
      return final.apply(this, arguments)
    }
  }
}
