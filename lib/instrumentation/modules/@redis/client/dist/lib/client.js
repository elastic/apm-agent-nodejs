const shimmer = require('../../../../../shimmer')

module.exports = function (client, agent, { version, enabled }) {
  const proto = client.default && client.default.prototype
  shimmer.wrap(client.default.prototype, 'commandsExecutor', function(original) {
    return function wrappedCommandsExecutor (command, args, cb) {
      console.log("CALLED WRAPPED commandsExecutor")
      return original.apply(this, arguments)
    }
  })
  // console.log( (new client.default).commandsExecutor)
  return client
};
