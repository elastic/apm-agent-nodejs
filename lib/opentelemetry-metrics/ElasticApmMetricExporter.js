/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

const { ExportResultCode } = require('@opentelemetry/core');
const {
  AggregationTemporality,
  InstrumentType,
  ExplicitBucketHistogramAggregation,
  SumAggregation,
  LastValueAggregation,
  DropAggregation,
  DataPointType,
} = require('@opentelemetry/sdk-metrics');
const LRU = require('lru-cache');

/**
 * The `timestamp` in a metricset for APM Server intake is "UTC based and
 * formatted as microseconds since Unix epoch".
 *
 * Dev note: We need to round because APM server intake requires an integer.
 * This means a loss of sub-ms precision, which for this use case is fine.
 */
function metricTimestampFromOTelHrTime(otelHrTime) {
  // OTel's HrTime is `[<seconds since unix epoch>, <nanoseconds>]`
  return Math.round(otelHrTime[0] * 1e6 + otelHrTime[1] / 1e3);
}

// From oteljs/packages/sdk-metrics/src/utils.ts#hashAttributes
function hashAttributes(attributes) {
  let keys = Object.keys(attributes);
  if (keys.length === 0) return '';

  // Return a string that is stable on key orders.
  keys = keys.sort();
  return JSON.stringify(keys.map((key) => [key, attributes[key]]));
}

/**
 * Fill in an Intake V2 API "sample" object for a histogram from an OTel Metrics
 * histogram DataPoint.
 *
 * Algorithm is from the spec (`convertBucketBoundaries`)
 */
function fillIntakeHistogramSample(sample, otelDataPoint) {
  const otelCounts = otelDataPoint.value.buckets.counts;
  const otelBoundaries = otelDataPoint.value.buckets.boundaries;

  const bucketCount = otelCounts.length;
  if (bucketCount === 0) {
    return;
  }

  const intakeCounts = (sample.counts = []);
  const intakeValues = (sample.values = []);
  sample.type = 'histogram';

  // otelBoundaries has a size of bucketCount-1
  // the first bucket has the boundaries ( -inf, otelBoundaries[0] ]
  // the second bucket has the boundaries ( otelBoundaries[0], otelBoundaries[1] ]
  // ..
  // the last bucket has the boundaries (otelBoundaries[bucketCount-2], inf)
  for (let i = 0; i < bucketCount; i++) {
    if (otelCounts[i] !== 0) {
      // ignore empty buckets
      intakeCounts.push(otelCounts[i]);
      if (i === 0) {
        // first bucket
        let bound = otelBoundaries[i];
        if (bound > 0) {
          bound /= 2;
        }
        intakeValues.push(bound);
      } else if (i === bucketCount - 1) {
        // last bucket
        intakeValues.push(otelBoundaries[bucketCount - 2]);
      } else {
        // in between
        const lower = otelBoundaries[i - 1];
        const upper = otelBoundaries[i];
        intakeValues.push(lower + (upper - lower) / 2);
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
  constructor(agent) {
    this._agent = agent;
    this._histogramAggregation = new ExplicitBucketHistogramAggregation(
      this._agent._conf.customMetricsHistogramBoundaries,
    );
    this._sumAggregation = new SumAggregation();
    this._lastValueAggregation = new LastValueAggregation();
    this._dropAggregation = new DropAggregation();
    this._attrDropWarnCache = new LRU({ max: 1000 });
    this._dataPointTypeDropWarnCache = new LRU({ max: 1000 });
  }

  /**
   * Spec: https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#aggregation
   *
   * @param {import('@opentelemetry/sdk-metrics').InstrumentType} instrumentType
   * @returns {import('@opentelemetry/sdk-metrics').Aggregation}
   */
  selectAggregation(instrumentType) {
    // The same behaviour as OTel's `DefaultAggregation`, except for changes
    // to the default Histogram bucket sizes and support for the
    // `custom_metrics_histogram_boundaries` config var.
    switch (instrumentType) {
      case InstrumentType.COUNTER:
      case InstrumentType.UP_DOWN_COUNTER:
      case InstrumentType.OBSERVABLE_COUNTER:
      case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
        return this._sumAggregation;
      case InstrumentType.OBSERVABLE_GAUGE:
        return this._lastValueAggregation;
      case InstrumentType.HISTOGRAM:
        return this._histogramAggregation;
      default:
        this._agent.logger.warn(
          `cannot selectAggregation: unknown OTel Metric instrumentType: ${instrumentType}`,
        );
        return this._dropAggregation;
    }
  }

  // Spec: https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#aggregation-temporality
  //
  // Note: This differs from the OTel SDK default.
  // `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=Cumulative`
  // https://opentelemetry.io/docs/reference/specification/metrics/sdk_exporters/otlp/
  selectAggregationTemporality(instrumentType) {
    switch (instrumentType) {
      case InstrumentType.COUNTER:
      case InstrumentType.OBSERVABLE_COUNTER:
      case InstrumentType.HISTOGRAM:
      case InstrumentType.OBSERVABLE_GAUGE:
        return AggregationTemporality.DELTA;
      case InstrumentType.UP_DOWN_COUNTER:
      case InstrumentType.OBSERVABLE_UP_DOWN_COUNTER:
        return AggregationTemporality.CUMULATIVE;
    }
  }

  async forceFlush() {
    return this._agent.flush();
  }

  async shutdown() {
    return this._agent.flush();
  }

  /**
   * Export an OTel `ResourceMetrics` to Elastic APM intake `metricset`s.
   *
   * Dev notes:
   * - Explicitly *not* including `metricData.descriptor.unit` because the APM
   *   spec doesn't include it. It isn't clear there is value.
   */
  export(resourceMetrics, resultCallback) {
    // console.log('resourceMetrics:'); console.dir(resourceMetrics, { depth: 10 })
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      // Metrics from separate instrumentation scopes must be in separate
      // `metricset` objects. In the future, the APM spec may dictate that we
      // add labels for the instrumentation scope -- perhaps `otel.scope.*`.
      // Discussion: https://github.com/elastic/apm/pull/742#discussion_r1061444699
      const metricsetFromAttrHash = {};

      for (const metricData of scopeMetrics.metrics) {
        const metricName = metricData.descriptor.name;
        if (this._agent._isMetricNameDisabled(metricName)) {
          continue;
        }
        if (
          !(
            metricData.dataPointType === DataPointType.GAUGE ||
            metricData.dataPointType === DataPointType.SUM ||
            metricData.dataPointType === DataPointType.HISTOGRAM
          )
        ) {
          if (!this._dataPointTypeDropWarnCache.has(metricName)) {
            this._agent.logger.warn(
              `dropping metric "${metricName}": cannot export metrics with dataPointType=${metricData.dataPointType}`,
            );
            this._dataPointTypeDropWarnCache.set(metricName, true);
          }
        }

        for (const dataPoint of metricData.dataPoints) {
          const labels = this._labelsFromOTelMetricAttributes(
            dataPoint.attributes,
            metricData.descriptor.name,
          );
          const attrHash = hashAttributes(labels);
          let metricset = metricsetFromAttrHash[attrHash];
          if (!metricset) {
            metricset = {
              samples: {},
              // Assumption: `endTime` is the same for all `dataPoint`s in
              // this `metricData`.
              timestamp: metricTimestampFromOTelHrTime(dataPoint.endTime),
              tags: labels,
            };
            metricsetFromAttrHash[attrHash] = metricset;
          }
          const sample = {};
          switch (metricData.dataPointType) {
            case DataPointType.GAUGE:
              sample.type = 'gauge';
              sample.value = dataPoint.value;
              break;
            case DataPointType.SUM:
              if (metricData.isMonotonic) {
                sample.type = 'counter';
              } else {
                sample.type = 'gauge';
              }
              sample.value = dataPoint.value;
              break;
            case DataPointType.HISTOGRAM:
              fillIntakeHistogramSample(sample, dataPoint);
              break;
          }
          if (sample.type) {
            metricset.samples[metricData.descriptor.name] = sample;
          }
        }
      }

      // Importantly, if a metric has no `dataPoints` then we send nothing. This
      // satisfies the following from the APM agents spec:
      //
      // > For all instrument types with delta temporality, agents MUST filter out
      // > zero values before exporting.
      Object.values(metricsetFromAttrHash).forEach((metricset) => {
        this._agent._apmClient.sendMetricSet(metricset);
      });
    }

    return resultCallback({ code: ExportResultCode.SUCCESS });
  }

  /**
   * Convert from `dataPoint.attributes` to a set of labels (a.k.a. tags) for
   * Elastic APM intake. Attributes with an *array* value are not supported --
   * they are dropped with a log.warn that mentions the metric and attribute
   * names.
   *
   * This makes *in-place* changes to the given `attrs` argument. It returns
   * the same object.
   *
   * https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#labels
   */
  _labelsFromOTelMetricAttributes(attrs, metricName) {
    const keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = attrs[k];
      if (Array.isArray(v)) {
        delete attrs[k];
        const cacheKey = metricName + '/' + k;
        if (!this._attrDropWarnCache.has(cacheKey)) {
          this._agent.logger.warn(
            { metricName, attrName: k },
            'dropping array-valued metric attribute: array attribute values are not supported',
          );
          this._attrDropWarnCache.set(cacheKey, true);
        }
      }
    }
    return attrs;
  }
}

module.exports = ElasticApmMetricExporter;
