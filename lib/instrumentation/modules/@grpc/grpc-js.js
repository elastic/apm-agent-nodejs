var shimmer = require('../../shimmer')

module.exports = function (grpc, agent, { version, enabled }) {
  if (!enabled) {
    return grpc
  }
  // console.log()
  shimmer.wrap(grpc.Server.prototype, 'register', function wrapServerRegister(orig) {
    return function wrappedRegistered (name, handler) {
      console.log(arguments)
      return orig.apply(this, arguments)
    }
  })
  return grpc
}
