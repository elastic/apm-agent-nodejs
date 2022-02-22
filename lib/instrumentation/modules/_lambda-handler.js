'use strict'
module.exports = function (module, agent, { version, enabled }) {
  if (!enabled) {
    return module
  }
  const { field } = agent._instrumentation.getLambdaHandlerInfo(process.env)
  if (!module[field] || module[field].name === 'wrappedLambda') {
    // avoid double wrapping
    return module
  }
  module[field] = agent.lambda(module[field])
  return module
}
