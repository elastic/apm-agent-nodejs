'use strict'
const { getLambdaHandlerInfo, wrapNestedPath } = require('../../lambda')
const Instrumentation = require('../index')

module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }

  const { field } = getLambdaHandlerInfo(process.env, Instrumentation.modules, agent.logger)
  wrapNestedPath(agent, field, module)
  return module
}
