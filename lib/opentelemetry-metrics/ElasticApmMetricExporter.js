/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { AggregationTemporality, InstrumentType } = require('@opentelemetry/sdk-metrics')
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

/**
 * @implements {import('@opentelemetry/sdk-metrics').PushMetricExporter}
 */
class ElasticApmMetricExporter {
  constructor (agent) {
    this._agent = agent
  }

  // Spec: https://github.com/elastic/apm/pull/742/files#diff-a04e98daf311e4b4d6a186717a32577382b938c32ebcfc3a73f3b322e584532eR16
  //
  // Note: This differs from the OTel SDK default.
  // `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=Cumulative`
  // https://opentelemetry.io/docs/reference/specification/metrics/sdk_exporters/otlp/
  selectAggregationTemporality (instrumentType) {
    // return AggregationTemporality.CUMULATIVE // XXX
    switch (instrumentType) {
      case InstrumentType.COUNTER:
      case InstrumentType.OBSERVABLE_COUNTER:
      case InstrumentType.HISTOGRAM:
      case InstrumentType.OBSERVABLE_GAUGE:
        return AggregationTemporality.DELTA
      case InstrumentType.UP_DOWN_COUNTER:
      case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
        return AggregationTemporality.CUMULATIVE
    }
  }

  async forceFlush () {
    // XXX see oteljs/doc/exporter-guide.md
    console.log('XXX ApmMetricExporter.forceFlush')
  }

  async shutdown () {
    // XXX see oteljs/doc/exporter-guide.md
    console.log('XXX ApmMetricExporter.shutdown')
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
    // console.log('XXX resourceMetrics:'); console.dir(resourceMetrics, { depth: 10 })
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
          // XXX This .type is *deprecated*!!
          //    See https://github.com/open-telemetry/opentelemetry-js/issues/3439
          //    https://github.com/open-telemetry/opentelemetry-js/pull/3520
          //    I haven't grokked those to know the alternative.
          //    We should/need a test case of a View that changes the aggregation
          //    of these. I don't know what that will mean for conversion to metricsets.
          //    - See PrometheusSerializer.ts's `toPrometheusType` that uses
          //      metricData.dataPointType instead. Note that the set of values
          //      here differs: SUM, GAUGE, HISTOGRAM, and fallback 'untyped'.
          //      Where "SUM" can be a 'counter' or 'gauge', depending.
          switch (metricData.descriptor.type) {
            case 'COUNTER':
            case 'OBSERVABLE_COUNTER':
              sample.type = 'counter'
              sample.value = dataPoint.value
              break
            case 'OBSERVABLE_GAUGE':
            case 'OBSERVABLE_UP_DOWN_COUNTER':
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

    // Importantly, if a metric has no `dataPoints` then we send nothing. This
    // satisfies the following from the APM agents spec:
    //
    // > For all instrument types with delta temporality, agents MUST filter out
    // > zero values before exporting.
    Object.values(metricsetFromAttrHash).forEach(metricset => {
      this._agent._transport.sendMetricSet(metricset)
    })
    return resultCallback({ code: ExportResultCode.SUCCESS })
  }
}

module.exports = ElasticApmMetricExporter
