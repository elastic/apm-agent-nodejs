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

    stats.duration.count++
    stats.duration.sum.us += (span._duration * 1000)
    return true
  }

  getOrCreateStats (resource, outcome) {
    const key = [resource, outcome].join('')
    let stats = this.statsMap.get(key)
    if (stats) {
      return stats
    }
    stats = {
      duration: {
        count: 0,
        sum: {
          us: 0
        }
       },
      destination_service_resource: resource,
      outcome: outcome
    }
    this.statsMap.set(key, stats)
    return stats
  }

  encode() {
    //Object.fromEntries(this.statsMap)
    const payload = []
    for(const [,stats] of this.statsMap) {
      payload.push(stats)
    }
    return payload
  }
}

module.exports = {
  DroppedSpanStats
}
