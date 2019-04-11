'use strict'

var shimmer = require('../shimmer')
var templateShared = require('../template-shared')

module.exports = function (handlebars, agent, { enabled }) {
  if (!enabled) return handlebars
  agent.logger.debug('shimming handlebars.compile')
  shimmer.wrap(handlebars, 'compile', templateShared.wrapCompile(agent, 'handlebars'))

  return handlebars
}
