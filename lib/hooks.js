'use strict'

var http = require('http')
var shimmer = require('shimmer')
var asyncState = require('./async-state')

module.exports = function (client) {
  shimmer({ logger: client.logger.error })
  shimmer.massWrap(http.Server.prototype, ['on', 'addListener'], function (fn) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return fn.call(this, event, onRequest)
      else return fn.apply(this, arguments)

      function onRequest (req, res) {
        asyncState.req = req
        listener.apply(this, arguments)
      }
    }
  })
}
