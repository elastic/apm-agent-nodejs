const STRATEGY_EXACT_MATCH = 1
const STRATEGY_SAME_KIND = 2

class SpanCompression {
  constructor (agent) {
    this._bufferedSpan = null
    this._agent = agent
    this.timestamp = null
    this.duration = null
    this.composite = {
      count: 0,
      sum: 0,
      compression_strategy: null
    }
  }

  setBufferedSpan (span) {
    this._bufferedSpan = span
  }

  getBufferedSpan () {
    return this._bufferedSpan
  }

  getCompressionStrategy (parentSpan, toCompressSpan) {
    if (!this._isEnabled() || !parentSpan._destination || !toCompressSpan._destination) {
      return false
    }

    const isStrategizable = parentSpan.type === toCompressSpan.type &&
      parentSpan.subtype === toCompressSpan.subtype &&
      parentSpan._destination.service.resource === toCompressSpan._destination.service.resource

    if (!isStrategizable) {
      return false
    }
    if (parentSpan.name === toCompressSpan.name) {
      return STRATEGY_EXACT_MATCH
    }
    return STRATEGY_SAME_KIND
  }

  tryToCompress (compositeSpan, spanToCompress) {
    if (!this._isEnabled()) {
      return false
    }
    // do I have a strat yet?
    if (!this.composite.compression_strategy) {
      // If not, check if strategizable or not and set if is or bail
      this.composite.compression_strategy = this.getCompressionStrategy(
        compositeSpan,
        spanToCompress
      )
      if (!this.composite.compression_strategy) {
        return false
      }

      // TODO: set initial composite context values
      this.composite.timestamp = compositeSpan.timestamp
      this.composite.count = 1
      this.composite.sum = compositeSpan._duration
    } else {
      // if so, compare with the compression strat and bail if mismatch
      const strat = this.getCompressionStrategy(compositeSpan, spanToCompress)
      if (strat !== this.composite.compression_strategy) {
        return false
      }
    }

    // START: do the compressing
    // update duration
    this.composite.duration = spanToCompress.timestamp - compositeSpan.timestamp
    // increment composite.count
    this.composite.count++
    // add this span's duration to composite.sum
    this.composite.sum += spanToCompress._duration
    // END: do the compressing

    return true
  }

  _isEnabled () {
    return this._agent._conf.spanCompressionEnabled
  }
}

// getCompressionStrat,

module.exports = {
  SpanCompression,
  constants: {
    STRATEGY_EXACT_MATCH,
    STRATEGY_SAME_KIND
  }
}
