/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { AggregationTemporality } = require('@opentelemetry/sdk-metrics')
const { ExportResultCode } = require('@opentelemetry/core')

/**
 * The `timestamp` in a metricset for APM Server intake is "UTC based and
 * formatted as microseconds since Unix epoch".
 */
function metricTimestampFromOTelHrTime (otelHrTime) {
  // OTel's HrTime is `[<seconds since unix epoch>, <nanoseconds>]`
  // XXX Do we really need to *round* this? Can APM server not take decimals? Or is nanosecond precision silly?
  return Math.round(otelHrTime[0] * 1e6 + otelHrTime[1] / 1e3)
}

// From oteljs/packages/sdk-metrics/src/utils.ts#hashAttributes
function hashAttributes (attributes) {
  let keys = Object.keys(attributes)
  if (keys.length === 0) return ''

  // Return a string that is stable on key orders.
  keys = keys.sort()
  return JSON.stringify(keys.map(key => [key, attributes[key]]))
}

class ElasticApmMetricExporter {
  constructor (agent) {
    this._agent = agent
  }

  selectAggregationTemporality (_instrumentType) {
    // XXX
    // See experimental/packages/opentelemetry-exporter-metrics-otlp-http/src/OTLPMetricExporterBase.ts
    // Could provide the same interface: pass down a config option and fallback to envvars.
    return AggregationTemporality.CUMULATIVE
  }

  async forceFlush () {
    // XXX see oteljs/doc/exporter-guide.md
    console.log('XXX ApmMetricExporter.forceFlush')
  }

  async shutdown () {
    // XXX see oteljs/doc/exporter-guide.md
    console.log('XXX ApmMetricExporter.shutdown')
  }

  export1 (resourceMetrics, resultCallback) { // XXX
    console.log('XXX ApmMetricExporter.export')
    console.dir(resourceMetrics, { depth: 10 })
    return resultCallback({ code: ExportResultCode.SUCCESS })
  }

  /* XXX
  # Open Questions on conversion from OTel "ResourceMetrics" to metricsets.

  Q1: Do we need to incorporate the `InstrumentationScope` identifiers? E.g.:
  ```
  scopeMetrics: [
    {
      scope: {
        name: 'metrics-exporter-play',
        version: '',
        schemaUrl: undefined
      },
  ```
  https://opentelemetry.io/docs/reference/specification/metrics/api/#get-a-meter
  says: "The effect of associating a Schema URL with a Meter MUST be that the
  telemetry emitted using the Meter will be associated with the Schema URL"

  Q2: We theoretically lose some precision in translating from
  `dataPoint.endTime` (high-precision time structure including nanoseconds)
  to `metricset.timestamp` (integer number of microseconds since the epoch).
  Does this matter?

  Q3: `AggregationTemporality` defaults to "CUMULATIVE". However, "DELTA" can
  be selected by a user. Does this (`Metric.aggregationTemporality`) need to
  be captured for proper usage of the metrics data downstream?

  Q4: What about `dataPoint.startTime`? Relevant for any feature parity?

  Q5: What about `dataPoint.{sum,min,max,count}` for histogram metrics?
  Do we need those for any feature parity?

  Q6: How do exponential histograms differ?

  Q7: OTel histogram metrics have N `buckets.boundaries` and N+1 `buckets.counts`.
  The first bucket.counts entry is for a count of events below the lowest bound.
  https://github.com/open-telemetry/opentelemetry-js/blob/e315f53263aafbd7edb417c87aef4efe234b83a4/packages/sdk-metrics/src/aggregator/types.ts#L39-L54
  Is dropping the first entry a valid conversion (see `.slice(1)` below)?

  Q8: What about exemplars? Do we support those in OTLP intake?

  Q9: We are dropping `metric.descriptor.description`.
  */
  export (resourceMetrics, resultCallback) {
    // console.dir(resourceMetrics, { depth: 10 })
    const metricsetFromAttrHash = {}
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metricData of scopeMetrics.metrics) {
        for (const dataPoint of metricData.dataPoints) {
          const attrHash = hashAttributes(dataPoint.attributes)
          // XXX metricset conversion in apm-server is also considering the 'timestamp', so we depend on that endTime sanity check here
          let metricset = metricsetFromAttrHash[attrHash]
          if (!metricset) {
            metricset = {
              samples: {},
              timestamp: metricTimestampFromOTelHrTime(dataPoint.endTime),
              tags: Object.assign(dataPoint.attributes) // XXX is this clone needed?
            }
            metricsetFromAttrHash[attrHash] = metricset
          } else {
            // XXX sanity check that `dataPoint.endTime` is the same for all datapoints in this metricset.
            if (metricset.timestamp !== metricTimestampFromOTelHrTime(dataPoint.endTime)) {
              console.log('XXX dataPoint.endTime mismatch', metricset, dataPoint)
            }
          }
          const sample = {}
          if (metricData.descriptor.unit) {
            sample.unit = metricData.descriptor.unit
          }
          switch (metricData.descriptor.type) {
            case 'COUNTER':
              sample.type = 'counter'
              sample.value = dataPoint.value
              break
            case 'UP_DOWN_COUNTER':
              sample.type = 'gauge'
              sample.value = dataPoint.value
              break
            case 'HISTOGRAM':
              // XXX This is wrong. Need to copy what apm-server is doing here: https://github.com/elastic/apm-server/blob/18f9a013136030f3b24810a6f88437ac09a67af5/internal/processor/otel/metrics.go#L426
              sample.type = 'histogram'
              sample.values = dataPoint.value.buckets.boundaries
              sample.counts = dataPoint.value.buckets.counts.slice(1)
              break
            default:
              console.log('XXX unknown metric type:', metricData.descriptor.type)
          }
          metricset.samples[metricData.descriptor.name] = sample
        }
      }
    }

    Object.values(metricsetFromAttrHash).forEach(metricset => {
      this._agent._transport.sendMetricSet(metricset)
    })
    return resultCallback({ code: ExportResultCode.SUCCESS })
  }
}

module.exports = ElasticApmMetricExporter
