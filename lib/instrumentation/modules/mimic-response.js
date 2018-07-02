'use strict'

var shimmer = require('../shimmer')

module.exports = function (mimicResponse, agent, version, enabled) {
  if (!enabled) return mimicResponse

  var ins = agent._instrumentation

  return function wrappedMimicResponse (fromStream, toStream) {
    // If we bound the `fromStream` emitter, but not the `toStream` emitter, we
    // need to do so as else the `on`, `addListener`, and `prependListener`
    // functions of the `fromStream` will be copied over to the `toStream` but
    // run in the context of the `fromStream`.
    if (fromStream && toStream &&
        shimmer.isWrapped(fromStream.on) &&
        !shimmer.isWrapped(toStream.on)) {
      ins.bindEmitter(toStream)
    }
    return mimicResponse.apply(null, arguments)
  }
}
