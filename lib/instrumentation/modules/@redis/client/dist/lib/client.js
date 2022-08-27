const shimmer = require('../../../../../shimmer')

module.exports = function (client, agent, { version, enabled }) {
  // client.default.prototype == [class RedisClient extends EventEmitter]
  shimmer.wrap(client.default.prototype, 'commandsExecutor', function(original) {
    return function wrappedCommandsExecutor (command, args, cb) {
      console.log("CALLED WRAPPED commandsExecutor")
      return original.apply(this, arguments)
    }
  })
  // console.log( (new client.default).commandsExecutor)
  return client
};
