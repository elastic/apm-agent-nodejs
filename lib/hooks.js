'use strict'

var shimmer = require('shimmer')
var modules = require('./instrumentation/modules')

module.exports = function (agent) {
  shimmer({ logger: agent.logger.error })

  if (agent._ff_instrument) fullInstrumentation(agent)
  else errorTracingOnly(agent)
}

function fullInstrumentation (agent) {
  agent.logger.trace('shimming function Module._load')
  var Module = require('module')
  shimmer.wrap(Module, '_load', function (orig) {
    return function (file) {
      return modules.patch(file, orig.apply(this, arguments), agent)
    }
  })
}

function errorTracingOnly (agent) {
  agent.logger.trace('shimming http.Server.prototype functions "on" and "addListener"')

  var http = require('http')
  var asyncState = require('./async-state')

  shimmer.massWrap(http.Server.prototype, ['on', 'addListener'], function (fn, name) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return fn.call(this, event, onRequest)
      else return fn.apply(this, arguments)

      function onRequest (req, res) {
        agent.logger.trace('intercepted call to http.Server.prototype.%s', name)
        asyncState.req = req
        listener.apply(this, arguments)
      }
    }
  })
}
