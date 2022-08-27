const shimmer = require('../../shimmer')
module.exports = function (redis, agent, { version, enabled }) {
  shimmer.wrap(redis, 'createClient', function(original) {
    return function wrappedCreateClient() {
      const client = original.apply(this. arguments)
      // wrap _every_ command method that's been added
      // independantly.
      console.log(client.set)
      return client
    }
  })
  return redis
};
