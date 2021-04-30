'use strict'

var semver = require('semver')

var shimmer = require('../shimmer')
var symbols = require('../../symbols')

module.exports = function (Knex, agent, { version, enabled }) {
  if (!enabled) return Knex
  if (semver.gte(version, '0.22.0')) {
    agent.logger.debug('knex version %s not supported - aborting...', version)
    return Knex
  }
  if (Knex.Client && Knex.Client.prototype) {
    var QUERY_FNS = ['queryBuilder', 'raw']
    agent.logger.debug('shimming Knex.Client.prototype.runner')
    shimmer.wrap(Knex.Client.prototype, 'runner', wrapRunner)
    agent.logger.debug('shimming Knex.Client.prototype functions: %j', QUERY_FNS)
    shimmer.massWrap(Knex.Client.prototype, QUERY_FNS, wrapQueryStartPoint)
  } else {
    agent.logger.debug('could not shim Knex')
  }

  function wrapQueryStartPoint (original) {
    return function wrappedQueryStartPoint () {
      var builder = original.apply(this, arguments)

      agent.logger.debug('capturing custom stack trace for knex')
      var obj = {}
      Error.captureStackTrace(obj)
      builder[symbols.knexStackObj] = obj

      return builder
    }
  }

  function wrapRunner (original) {
    return function wrappedRunner () {
      var runner = original.apply(this, arguments)

      agent.logger.debug('shimming knex runner.query')
      shimmer.wrap(runner, 'query', wrapQuery)

      return runner
    }
  }

  function wrapQuery (original) {
    return function wrappedQuery () {
      agent.logger.debug('intercepted call to knex runner.query')
      if (this.connection) {
        this.connection[symbols.knexStackObj] = this.builder ? this.builder[symbols.knexStackObj] : null
      }
      return original.apply(this, arguments)
    }
  }

  return Knex
}
