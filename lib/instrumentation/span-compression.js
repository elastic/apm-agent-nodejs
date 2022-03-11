const STRATEGY_EXACT_MATCH = 1
const STRATEGY_SAME_KIND = 2

class SpanCompression {
  constructor() {
    this._bufferedSpan = null

    this.timestamp = null
    this.duration = null
    this.composite = {
      count: 0,
      sum: 0,
      compression_strategy: null
    }
  }

  setBufferedSpan(span) {
    this._bufferedSpan = span
  }

  getBufferedSpan() {
    return this._bufferedSpan
  }

  getCompressionStrategy(parentSpan, toCompressSpan) {
    if(!parentSpan._destination || !toCompressSpan._destination) {
      return false
    }

    const isStrategizable = parentSpan.type === toCompressSpan.type &&
      parentSpan.subtype === toCompressSpan.subtype &&
      parentSpan._destination.service.resource === toCompressSpan._destination.service.resource

    if(!isStrategizable) {
      return false
    }
    if(parentSpan.name === toCompressSpan.name) {
      return STRATEGY_EXACT_MATCH
    }
    return STRATEGY_SAME_KIND
  }

  tryToCompress(compositeSpan, spanToCompress) {
    // do I have a strat yet?
    if(!this.composite.compression_strategy) {
      // If not, check if strategizable or not and set if is or bail
      this.composite.compression_strategy = this.getCompressionStrategy(
        compositeSpan,
        spanToCompress
      )
      if(!this.composite.compression_strategy) {
        return false
      }

      // TODO: set initial duration
    } else {
      // if so, compare with the compression strat and bail if mismatch
      const strat = this.getCompressionStrategy(compositeSpan,spanToCompress)
      if(strat !== this.composite.compression_strategy) {
        return false
      }
    }

    // compress based on strat
      // set name is same_kind
      // set timestamp if not set yet
      // update duration
      // increment composite.count
      // add this span's duration to composite.sum
    return true
  }
}

//getCompressionStrat,

module.exports = {
  SpanCompression,
  constants: {
    STRATEGY_EXACT_MATCH,
    STRATEGY_SAME_KIND
  }
}
