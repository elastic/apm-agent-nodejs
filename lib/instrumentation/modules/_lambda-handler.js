module.exports = function(module, agent, {version, enabled}){
  const [handlerModule, handlerFunction] = process.env._HANDLER.split('.')
  if(module[handlerFunction].name === 'wrappedLambda') {
    // avoid double wrapping
    return module
  }
  module[handlerFunction] = agent.lambda(module[handlerFunction])
  console.log("i am the lambda handler instrumentation")
  return module
}
