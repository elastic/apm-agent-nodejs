'use strict'

var shimmer = require('../shimmer')
var templateShared = require('../template-shared')

module.exports = function (jade, agent, { enabled }) {
  if (!enabled) return jade
  agent.logger.debug('shimming jade.compile')
  shimmer.wrap(jade, 'compile', templateShared.wrapCompile(agent, 'jade'))

  return jade
}
