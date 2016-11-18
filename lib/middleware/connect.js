'use strict'

module.exports = function connectMiddleware () {
  var agent = this
  return function (err, req, res, next) {
    agent.captureError(err, { request: req }, function opbeatMiddleware () {
      next(err)
    })
  }
}
