'use strict'
const { getLambdaHandlerInfo } = require('../../lambda')
const Instrumentation = require('../index')
module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }

  const { field } = getLambdaHandlerInfo(process.env, Instrumentation.modules, agent.logger)

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
