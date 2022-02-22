'use strict'
module.exports = function (module, agent, { version, enabled }) {
  const { field } = agent._instrumentation.getLambdaHandler(process.env)
  if (!module[field] || module[field].name === 'wrappedLambda') {
    // avoid double wrapping
    return module
  }
  module[field] = agent.lambda(module[field])
  return module
}
