'use strict'
class DroppedSpanStats {
  constructor () {
    this.statsMap = new Map()
  }

  captureDroppedSpan (span) {
    const resource = span && span._destination && span._destination.service && span._destination.service.resource
    if (!resource || !span.outcome) {
      return
    }

    const stats = this.getOrCreateStats(resource, span.outcome)

    stats.count++
    stats.sum += span._duration
    return true
  }

  getOrCreateStats (resource, outcome) {
    const key = [resource, outcome].join('')
    let stats = this.statsMap.get(key)
    if (stats) {
      return stats
    }
    stats = {
      count: 0,
      sum: 0, // from span._duration, as miliseconds/ms
      // (converted to microseconds/us when serialized)
      destination_service_resource: resource,
      outcome: outcome
    }
    this.statsMap.set(key, stats)
    return stats
  }
}

module.exports = {
  DroppedSpanStats
}
