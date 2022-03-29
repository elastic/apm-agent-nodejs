'use strict'
const STRATEGY_EXACT_MATCH = 'exact_match'
const STRATEGY_SAME_KIND = 'same_kind'

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

  // Compares two spans and returns which compression strategy to use
  // or returns false if the second span can't be compressed into the
  // first.
  //
  // @param Span compositeSpan
  // @param Span toCompressSpan
  // @returns boolean|String
  _getCompressionStrategy (compositeSpan, toCompressSpan) {
    if (!this._isEnabled() || !compositeSpan._destination || !toCompressSpan._destination) {
      return false
    }

    const isSameKind = compositeSpan.type === toCompressSpan.type &&
    compositeSpan.subtype === toCompressSpan.subtype &&
    compositeSpan._destination.service.resource === toCompressSpan._destination.service.resource

    if (!isSameKind) {
      return false
    }

    let strategy = STRATEGY_SAME_KIND
    if (compositeSpan.name === toCompressSpan.name) {
      strategy = STRATEGY_EXACT_MATCH
    }

    // check duration limits
    if (!this._checkDuration(compositeSpan._duration, toCompressSpan._duration, strategy)) {
      return false
    }

    return strategy
  }

  // Sets initial composite values or confirms strategy matches
  //
  // Returns true if spanToCompress can be compressed into compositeSpan,
  // returns false otherwise.
  //
  // @param Span compositeSpan
  // @param Span spanToCompress
  // @returns boolean
  _initCompressionStrategy (compositeSpan, spanToCompress) {
    if (!this.composite.compression_strategy) {
      // If no strategy is set, check if strategizable or not. If so,
      // set initial values.  If not, bail.
      this.composite.compression_strategy = this._getCompressionStrategy(
        compositeSpan,
        spanToCompress
      )
      if (!this.composite.compression_strategy) {
        return false
      }

      // set initial composite context values
      this.timestamp = compositeSpan.timestamp
      this.composite.count = 1
      this.composite.sum = compositeSpan._duration
    } else {
      // if so, compare with the compression strat and bail if mismatch
      const strat = this._getCompressionStrategy(compositeSpan, spanToCompress)
      if (strat !== this.composite.compression_strategy) {
        return false
      }
    }

    return true
  }

  // Helper method for duration checking
  //
  // Checks whether the additional time will "fit" within the
  // current duration based on a span compression strategy
  // constant.
  //
  // @param int currentMs
  // @param int additionalMs
  // @param String type
  // @returns boolean
  _checkDuration (currentMs, additionalMs, type) {
    const totalDuractionAsSeconds = (currentMs + additionalMs) / 1000

    if (type === STRATEGY_EXACT_MATCH && (totalDuractionAsSeconds < this._agent._conf.spanCompressionExactMatchMaxDuration)) {
      return true
    }

    if (type === STRATEGY_SAME_KIND && (totalDuractionAsSeconds < this._agent._conf.spanCompressionSameKindMaxDuration)) {
      return true
    }

    return false
  }

  // Attempts to compression the second span into the first
  //
  // @param Span compositeSpan
  // @param Span spanToCompress
  // @return boolean
  tryToCompress (compositeSpan, spanToCompress) {
    if (!this._isEnabled()) {
      return false
    }
    // do I have a strategy yet?
    if (!this._initCompressionStrategy(compositeSpan, spanToCompress)) {
      return false
    }
    // check max duration
    if (!this._checkDuration(this.composite.sum, spanToCompress._duration, this.composite.compression_strategy)) {
      return false
    }
    // START: do the compressing
    // update duration
    this.duration = spanToCompress._endTimestamp - compositeSpan.timestamp
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

  isCompositeSameKind () {
    return this.composite.compression_strategy === STRATEGY_SAME_KIND
  }

  isComposite () {
    return this.composite.count > 1
  }

  // Encodes/Serializes composite span properties
  // @return Object
  encode () {
    return {
      compression_strategy: this.composite.compression_strategy,
      count: this.composite.count,
      sum: this.composite.sum
    }
  }
}

module.exports = {
  SpanCompression,
  constants: {
    STRATEGY_EXACT_MATCH,
    STRATEGY_SAME_KIND
  }
}
