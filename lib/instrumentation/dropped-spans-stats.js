/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const MAX_DROPPED_SPANS_STATS = 128;

class DroppedSpansStats {
  constructor() {
    this.statsMap = new Map();
  }

  /**
   * Record this span in dropped spans stats.
   *
   * @param {Span} span
   * @returns {boolean} True iff this span was added to stats. This return value
   *    is only used for testing.
   */
  captureDroppedSpan(span) {
    if (!span) {
      return false;
    }

    const serviceTargetType = span._serviceTarget && span._serviceTarget.type;
    const serviceTargetName = span._serviceTarget && span._serviceTarget.name;
    const resource =
      span._destination &&
      span._destination.service &&
      span._destination.service.resource;
    if (
      !span._exitSpan ||
      !(serviceTargetType || serviceTargetName) ||
      !resource
    ) {
      return false;
    }

    const stats = this._getOrCreateStats(
      serviceTargetType,
      serviceTargetName,
      resource,
      span.outcome,
    );
    if (!stats) {
      return false;
    }
    stats.duration.count++;
    stats.duration.sum.us += span._duration * 1000;
    return true;
  }

  _getOrCreateStats(serviceTargetType, serviceTargetName, resource, outcome) {
    const key = [serviceTargetType, serviceTargetName, resource, outcome].join(
      '',
    );
    let stats = this.statsMap.get(key);
    if (stats) {
      return stats;
    }

    if (this.statsMap.size >= MAX_DROPPED_SPANS_STATS) {
      return;
    }

    stats = {
      duration: {
        count: 0,
        sum: {
          us: 0,
        },
      },
      destination_service_resource: resource,
      outcome,
    };
    if (serviceTargetType) {
      stats.service_target_type = serviceTargetType;
    }
    if (serviceTargetName) {
      stats.service_target_name = serviceTargetName;
    }
    this.statsMap.set(key, stats);
    return stats;
  }

  encode() {
    // `duration.sum.us` is an integer in the intake API, but is stored as
    // a float. We assume this `.encode()` is typically only called when the
    // transaction is ended, so the in-place loss of the fractional value is
    // acceptable.
    const result = [];
    for (const stats of this.statsMap.values()) {
      stats.duration.sum.us = Math.round(stats.duration.sum.us);
      result.push(stats);
    }
    return result;
  }

  size() {
    return this.statsMap.size;
  }
}

module.exports = {
  DroppedSpansStats,

  // Exported for testing-only.
  MAX_DROPPED_SPANS_STATS,
};
