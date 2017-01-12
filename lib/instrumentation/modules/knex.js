'use strict'

var debug = require('debug')('opbeat')
var shimmer = require('../shimmer')

module.exports = function (Knex, opbeat, version) {
  if (Knex.Client && Knex.Client.prototype) {
    var QUERY_FNS = ['queryBuilder', 'raw']
    debug('shimming Knex.Client.prototype.runner')
    shimmer.wrap(Knex.Client.prototype, 'runner', wrapRunner)
    debug('shimming Knex.Client.prototype functions:', QUERY_FNS)
    shimmer.massWrap(Knex.Client.prototype, QUERY_FNS, wrapQueryStartPoint)
  } else {
    debug('could not shim Knex')
  }

  return Knex
}

function wrapQueryStartPoint (original) {
  return function wrappedQueryStartPoint () {
    var builder = original.apply(this, arguments)

    debug('capturing custom stack trace for knex')
    var obj = {}
    Error.captureStackTrace(obj)
    builder._opbeatStackObj = obj

    return builder
  }
}

function wrapRunner (original) {
  return function wrappedRunner () {
    var runner = original.apply(this, arguments)

    debug('shimming knex runner.query')
    shimmer.wrap(runner, 'query', wrapQuery)

    return runner
  }
}

function wrapQuery (original) {
  return function wrappedQuery () {
    debug('intercepted call to knex runner.query')
    if (this.connection) {
      this.connection._opbeatStackObj = this.builder ? this.builder._opbeatStackObj : null
    }
    return original.apply(this, arguments)
  }
}
