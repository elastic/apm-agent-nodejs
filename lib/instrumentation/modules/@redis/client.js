const shimmer = require('../../shimmer')
module.exports = function (redis, agent, { version, enabled }) {
  shimmer.wrap(redis, 'createClient', function(original) {
    return function wrappedCreateClient() {
      // first, create the client
      const client = original.apply(this. arguments)

      // then wrap _every_ command
      // https://github.com/redis/node-redis/blob/master/packages/client/lib/client/commands.ts

      // that's now on the client variable
      return client
    }
  })
  return redis
};
