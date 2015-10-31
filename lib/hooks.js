'use strict'

var shimmer = require('shimmer')
var modules = require('./instrumentation/modules')

module.exports = function (client) {
  // This will actual just use the logger of the last client parsed in. In most
  // use-cases this is a non-issue, but if someone tries to initiate multiple
  // clients with different loggers, this will get weird
  shimmer({ logger: client.logger.error })

  if (client._ff_instrument) fullInstrumentation(client)
  else errorTracingOnly(client)
}

function fullInstrumentation (client) {
  client.logger.trace('shimming function Module._load')
  var Module = require('module')
  shimmer.wrap(Module, '_load', function (orig) {
    return function (file) {
      return modules.patch(file, orig.apply(this, arguments), client)
    }
  })
}

function errorTracingOnly (client) {
  client.logger.trace('shimming http.Server.prototype functions "on" and "addListener"')

  var http = require('http')
  var asyncState = require('./async-state')

  shimmer.massWrap(http.Server.prototype, ['on', 'addListener'], function (fn, name) {
    return function (event, listener) {
      if (event === 'request' && typeof listener === 'function') return fn.call(this, event, onRequest)
      else return fn.apply(this, arguments)

      function onRequest (req, res) {
        client.logger.trace('intercepted call to http.Server.prototype.%s', name)
        asyncState.req = req
        listener.apply(this, arguments)
      }
    }
  })
}
