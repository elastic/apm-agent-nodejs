'use strict'
const { getLambdaHandlerInfo } = require('../../lambda')
const Instrumentation = require('../index')
module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }

  const { field } = getLambdaHandlerInfo(process.env, Instrumentation.modules, agent.logger)
  if (!module[field] || module[field].name === 'wrappedLambda') {
    // avoid double wrapping
    return module
  }
  module[field] = agent.lambda(module[field])
  return module
}
