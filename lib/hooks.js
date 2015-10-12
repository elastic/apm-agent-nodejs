'use strict'

var http = require('http')
var shimmer = require('shimmer')
var asyncState = require('./async-state')
var modules = require('./instrumentation/modules')

module.exports = function (client) {
  if (!client._ff_instrument) return

  // TODO: This will actual just use the logger of the last client parsed in.
  // In most use-cases this is a non-issue, but if someone tries to initiate
  // multiple clients with different loggers, this will get weird
  shimmer({ logger: client.logger.error })

  client.logger.trace('shimming function Module._load')
  var Module = require('module')
  shimmer.wrap(Module, '_load', function (orig) {
    return function (file) {
      return modules.patch(file, orig.apply(this, arguments), client)
    }
  })
}
