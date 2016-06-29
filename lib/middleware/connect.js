'use strict'

module.exports = function connectMiddleware () {
  var agent = this
  return function (err, req, res, next) {
    // In v3.x, the captureError callback will only be called if the agent is
    // active. This is scheduled to change in v4.x. When using the middleware
    // we want to call the next function even if the agent is inactive, so
    // until we release v4.x we need a way to tell the captureError function
    // that the callback should be called even if the agent is inactive. This
    // is done by naming the callback `_opbeatMiddleware`.
    // TODO: Undo this hack in v4.x
    agent.captureError(err, { request: req }, function _opbeatMiddleware () {
      next(err)
    })
  }
}
