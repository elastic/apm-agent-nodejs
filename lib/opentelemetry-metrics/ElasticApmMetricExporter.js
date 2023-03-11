/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { ExportResultCode } = require('@opentelemetry/core')
const {
  AggregationTemporality,
  InstrumentType,
  ExplicitBucketHistogramAggregation,
  SumAggregation,
  LastValueAggregation,
  DropAggregation,
  DataPointType
} = require('@opentelemetry/sdk-metrics')

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
 * Fill in an Intake V2 API "sample" object for a histogram from an OTel Metrics
 * histogram DataPoint.
 *
 * Algorithm is from the spec (`convertBucketBoundaries`)
 */
function fillIntakeHistogramSample (sample, otelDataPoint) {
  const otelCounts = otelDataPoint.value.buckets.counts
  const otelBoundaries = otelDataPoint.value.buckets.boundaries

  const bucketCount = otelCounts.length
  if (bucketCount === 0) {
    return
  }

  const intakeCounts = sample.counts = []
  const intakeValues = sample.values = []
  sample.type = 'histogram'

  // otelBoundaries has a size of bucketCount-1
  // the first bucket has the boundaries ( -inf, otelBoundaries[0] ]
  // the second bucket has the boundaries ( otelBoundaries[0], otelBoundaries[1] ]
  // ..
  // the last bucket has the boundaries (otelBoundaries[bucketCount-2], inf)
  for (let i = 0; i < bucketCount; i++) {
    if (otelCounts[i] !== 0) { // ignore empty buckets
      intakeCounts.push(otelCounts[i])
      if (i === 0) { // first bucket
        let bound = otelBoundaries[i]
        if (bound > 0) {
          bound /= 2
        }
        intakeValues.push(bound)
      } else if (i === bucketCount - 1) { // last bucket
        intakeValues.push(otelBoundaries[bucketCount - 2])
      } else { // in between
        const lower = otelBoundaries[i - 1]
        const upper = otelBoundaries[i]
        intakeValues.push(lower + (upper - lower) / 2)
      }
    }
  }
}

/**
 * A PushMetricExporter that exports to an Elastic APM server. It is meant to be
 * used with a PeriodicExportingMetricReader -- which defers to
 * `selectAggregation` and `selectAggregationTemporality` on this class.
 *
 * @implements {import('@opentelemetry/sdk-metrics').PushMetricExporter}
 */
class ElasticApmMetricExporter {
  constructor (agent) {
    this._agent = agent
    this._histogramAggregation = new ExplicitBucketHistogramAggregation(
      this._agent._conf.customMetricsHistogramBoundaries)
    this._sumAggregation = new SumAggregation()
    this._lastValueAggregation = new LastValueAggregation()
    this._dropAggregation = new DropAggregation()
  }

  /**
   * Spec: https://github.com/elastic/apm/pull/742/files#diff-a04e98daf311e4b4d6a186717a32577382b938c32ebcfc3a73f3b322e584532eR37
   *
   * @param {import('@opentelemetry/sdk-metrics').InstrumentType} instrumentType
   * @returns {import('@opentelemetry/sdk-metrics').Aggregation}
   */
  selectAggregation (instrumentType) {
    // The same behaviour as OTel's `DefaultAggregation`, except for changes
    // to the default Histogram bucket sizes and support for the
    // `custom_metrics_histogram_boundaries` config var.
    switch (instrumentType) {
      case InstrumentType.COUNTER:
      case InstrumentType.UP_DOWN_COUNTER:
      case InstrumentType.OBSERVABLE_COUNTER:
      case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
        return this._sumAggregation
      case InstrumentType.OBSERVABLE_GAUGE:
        return this._lastValueAggregation
      case InstrumentType.HISTOGRAM:
        return this._histogramAggregation
      default:
        this._agent.logger.warn(`cannot selectAggregation: unknown OTem Metric instrumentType: ${instrumentType}`)
        return this._dropAggregation
    }
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

  Q4: What about `dataPoint.startTime`? Relevant for any feature parity?

  Q5: What about `dataPoint.{sum,min,max,count}` for histogram metrics?
  Do we need those for any feature parity?

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
              // XXX Attribute sanitization pending this spec discussion: https://github.com/elastic/apm/pull/742/files#r1086885794
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
          switch (metricData.dataPointType) {
            case DataPointType.GAUGE:
              sample.type = 'gauge'
              sample.value = dataPoint.value
              break
            case DataPointType.SUM:
              if (metricData.isMonotonic) {
                sample.type = 'counter'
              } else {
                sample.type = 'gauge'
              }
              sample.value = dataPoint.value
              break
            case DataPointType.HISTOGRAM:
              fillIntakeHistogramSample(sample, dataPoint)
              break
            default:
              this._agent.logger.debug(`could not serialize metric datum with dataPointType=${metricData.dataPointType}`)
          }
          if (sample.type) {
            metricset.samples[metricData.descriptor.name] = sample
          }
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
