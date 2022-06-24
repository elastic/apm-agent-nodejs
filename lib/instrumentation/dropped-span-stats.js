/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'
const LIMIT_STATS = 128
class DroppedSpanStats {
  constructor () {
    this.statsMap = new Map()
  }

  captureDroppedSpan (span) {
    const resource = span && span._destination && span._destination.service && span._destination.service.resource
    if (!resource || !span._exitSpan) {
      return
    }

    const stats = this.getOrCreateStats(resource, span.outcome)
    if (!stats) {
      return
    }
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

    if (this.statsMap.size >= LIMIT_STATS) {
      return
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

  encode () {
    return Array.from(this.statsMap.values())
  }

  size () {
    return this.statsMap.size
  }
}

module.exports = {
  DroppedSpanStats
}
