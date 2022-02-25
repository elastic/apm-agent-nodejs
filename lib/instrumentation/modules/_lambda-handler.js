'use strict'
const { getLambdaHandlerInfo } = require('../../lambda')
const Instrumentation = require('../index')

// wraps a nested property on the module object with the lambda handler
// @param string field ex. "foo.baz.bar"
// @param object module
// @return object
function wrapNestedPath (agent, field, module) {
  const parts = field.split('.')
  let object = module
  while (parts.length > 0) {
    const prop = parts.shift()
    if (parts.length === 0) {
      object[prop] = agent.lambda(object[prop])
    } else {
      object = object[prop]
    }
    if (!object) {
      break
    }
  }
  return module
}

module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }

  const { field } = getLambdaHandlerInfo(process.env, Instrumentation.modules, agent.logger)
  return wrapNestedPath(agent, field, module)
}
