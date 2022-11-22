/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Trent's raw play script for feeling out config, usage, conversion, etc.

// Config
// var METRICS_SERVER_URL = 'http://localhost:4318/v1/metrics' // default
// var METRICS_SERVER_URL = 'https://my-deployment-31a70c.apm.us-west2.gcp.elastic-cloud.com'
var METRICS_SERVER_URL = 'http://localhost:8200'
var METRICS_SECRET_TOKEN = '[REDACTED]'
const authzToken = `Bearer ${METRICS_SECRET_TOKEN}`
var METRICS_EXPORTER_FLAVOUR = 'otlphttpjson' // intakev2 | otlpgrpc | otlphttpprotobuf | otlphttpjson
METRICS_EXPORTER_FLAVOUR = 'intakev2'

const apm = require('../../').start({
  serviceName: 'metrics-exporter-play3',
  apmServerVersion: '8.4.1', // Skip the "fetch APM server version" request for simplicity.
  centralConfig: false, // Skip these separate requests for simplicity.
  // cloudProvider: 'none', // Skip these separate requests for simplicity.
  // serverUrl: METRICS_SERVER_URL,
  // secretToken: METRICS_SECRET_TOKEN,
  metricsInterval: '3s',
  apiRequestTime: '5s'
})

const { metrics: otelMetrics } = require('@opentelemetry/api-metrics')
const { DiagConsoleLogger, DiagLogLevel, diag } = require('@opentelemetry/api')
const { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { ExportResultCode } = require('@opentelemetry/core')

// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL)

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

  export (resourceMetrics, resultCallback) {
    /*
    XXX Conversion Qs to figure out or ask around:

    Q1: Do we need to incorporate these Meter identifiers? https://opentelemetry.io/docs/reference/specification/metrics/api/#get-a-meter
    says: "The effect of associating a Schema URL with a Meter MUST be that the
    telemetry emitted using the Meter will be associated with the Schema URL"
        scope: {
          name: 'metrics-exporter-play',
          version: '',
          schemaUrl: undefined
        },

    Q2: Can APM server metricset.timestamp really only be an integer? It is
    microseconds since the epoch. OTel Metrics have a timer with nanosecond
    values (if not precision).

    Q3: Anything special needed for AggregationTemporality.DELTA?

    Q4: What about `dataPoint.startTime`? Relevant for any feature parity?

    Q5: What about `dataPoint.{sum,min,max,count}`? Do we need those for any feature parity?

    Q6: How do exponential histograms differ?

    Q7: exemplars?
    */
    // console.dir(resourceMetrics, { depth: 10 })
    const metricsetFromAttrHash = {}
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metricData of scopeMetrics.metrics) {
        for (const dataPoint of metricData.dataPoints) {
          const attrHash = hashAttributes(dataPoint.attributes)
          let metricset = metricsetFromAttrHash[attrHash]
          if (!metricset) {
            metricset = {
              samples: {},
              timestamp: metricTimestampFromOTelHrTime(dataPoint.endTime),
              tags: Object.assign(dataPoint.attributes) // XXX is this clone needed?
            }
            metricsetFromAttrHash[attrHash] = metricset
          } else {
            // XXX sanity check
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
              sample.type = 'histogram'
              sample.values = dataPoint.value.buckets.boundaries
              // n+1 counts. First is num events below first boundary. Explained here:
              // https://github.com/open-telemetry/opentelemetry-js/blob/e315f53263aafbd7edb417c87aef4efe234b83a4/packages/sdk-metrics/src/aggregator/types.ts#L39-L54
              // XXX Is dropping the first entry valid for feature parity?
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

  // This is a version of `export3` that does the best-effort grouping for similar tags.
  // This should reduce duplication for the common case.
  export3 (resourceMetrics, resultCallback) {
    let currLabelsHash
    let currMetricset
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metricData of scopeMetrics.metrics) {
        for (const dataPoint of metricData.dataPoints) {
          const sample = {
            value: dataPoint.value
            // XXX type?, unit?, handle Histogram (counts, values)
          }
          // XXX This isn't a safe hash, order of attributes could be diff. What does OTel use?
          const labelsHash = JSON.stringify(dataPoint.attributes)
          if (labelsHash === currLabelsHash) {
            currMetricset.samples[metricData.descriptor.name] = sample
          } else {
            currLabelsHash = labelsHash
            if (currMetricset) {
              console.log('XXX sendMetricSet: ', currMetricset)
              this._agent._transport.sendMetricSet(currMetricset)
            }
            currMetricset = {
              samples: {
                [metricData.descriptor.name]: sample
              },
              // XXX We are assuming dataPoint.endTime is identical for all resourceMetrics. Is that true?
              timestamp: metricTimestampFromOTelHrTime(dataPoint.endTime),
              tags: Object.assign(dataPoint.attributes) // XXX is this clone needed?
            }
          }
        }
      }
    }
    if (currMetricset) {
      console.log('XXX sendMetricSet (last one): ', currMetricset)
      this._agent._transport.sendMetricSet(currMetricset)
    }
    return resultCallback({ code: ExportResultCode.SUCCESS })
  }
}

let OTLPMetricExporter
let metricExporter
switch (METRICS_EXPORTER_FLAVOUR) {
  case 'intakev2':
    metricExporter = new ElasticApmMetricExporter(apm)
    break
  case 'otlpgrpc':
    OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-grpc').OTLPMetricExporter
    // Setting auth for this OTLP/gRPC `OTLPMetricExporter` is currently a hack:
    //    process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = 'Authorization=Bearer $secretToken'
    // The silly OTLPGRPCExporterNodeBase (a) complains about `headers` in
    // config, but then immediately supprots the `OTEL_*_HEADERS` envvars.
    //   if (config.headers) {
    //       diag.warn('Headers cannot be set when using grpc');
    //   }
    //   const headers = baggageUtils.parseKeyPairsIntoRecord(getEnv().OTEL_EXPORTER_OTLP_HEADERS);
    // Then in the subclass:
    //   const headers = baggageUtils.parseKeyPairsIntoRecord(getEnv().OTEL_EXPORTER_OTLP_METRICS_HEADERS);
    //
    // XXX It would be cleaner to pass in `metadata`, but that is a @grpc/grpc-js
    //    type, so I'm not sure how to do that correctly. Perhaps just import
    //    the other module, boo.
    process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS = `Authorization=${authzToken}` // XXX lame hack
    metricExporter = new OTLPMetricExporter({
      url: METRICS_SERVER_URL // Explicitly do *not* append '/v1/metrics'.
    })
    break
  case 'otlphttpprotobuf':
    OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-proto').OTLPMetricExporter
    metricExporter = new OTLPMetricExporter({
      url: METRICS_SERVER_URL + '/v1/metrics',
      headers: {
        Authorization: authzToken
      }
    })
    break
  case 'otlphttpjson':
    // APM server doesn't currently support OTLP/HTTP with JSON
    //   https://www.elastic.co/guide/en/apm/guide/current/open-telemetry.html#open-telemetry-known-limitations
    // so there isn't much point in pursuing this currently.
    OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-http').OTLPMetricExporter
    metricExporter = new OTLPMetricExporter({
      url: METRICS_SERVER_URL + '/v1/metrics',
      headers: {
        Authorization: authzToken
      }
    })
    break
  default:
    throw new Error('wat')
}

// // Set MetricExporter HTTP agent to the APM agent\'s own to share conn pool.
// // However, because of the long-lived intake-v2 requests, there isn't conn
// // sharing. So there is no real point.
// metricExporter._otlpExporter.agent = apm._transport._agent

const meterProvider = new MeterProvider({
  resource: new Resource({
    trentm_flav: METRICS_EXPORTER_FLAVOUR,
    [SemanticResourceAttributes.SERVICE_NAME]: 'metrics-otlphttp-exporter',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development'
  })
})
console.log('XXX meterProvider resource: ', meterProvider._sharedState.resource)

// XXX How to delay until have metadata?
//   Can we *update* the `resource` on a MeterProvider? No.
//   OTel's NodeSDK.start() will `await this.detectResources()`, so they
//   don't support late-added resources. You are meant to:
//      sdk.start().then(() => { /* only start using it  in here */ }
//   which kinda sucks.
//
//   So to just add `resource` to a MeterProvider and use that we would need to
//   impl a specialized MeterProvider that ensure defered sending? Hard.
//
//   Else have a subclass (or just hack into) our MeterProvider to set/update
//   `meterProvider._sharedState.resource`.
console.log('XXX apm metadata', apm._transport._encodedMetadata)
apm._transport.on('cloud-metadata', encodedMetadata => {
  // XXX The 'cloud-metadata' event isn't reliable for this. Need to impl a
  //     new event that is about "metadata is ready", to handle the 'extra' thing.
  // XXX New constraint: we don't collect metrics until after this.
  console.log('XXX cloud-metadata is in!', encodedMetadata)
  meterProvider._sharedState.resource = meterProvider._sharedState.resource.merge(
    new Resource({ elastic_apm_metadata: encodedMetadata })
  )
  console.log('XXX meterProvider._sharedState.resource : ', meterProvider._sharedState.resource)
})

console.log('XXX metricsInterval', apm._conf.metricsInterval)
meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: metricExporter,
  // exportIntervalMillis: 1000
  exportIntervalMillis: apm._conf.metricsInterval * 1000
}))
otelMetrics.setGlobalMeterProvider(meterProvider)

// Create some metrics.
// XXX what about summary? DataPointType.SUM
// XXX what about Observable* meters? E.g. do they have different dataPoint.endTime perhaps?
// XXX what about an "exponential" histogram?
// XXX other params?
const meter = otelMetrics.getMeter('metrics-exporter-play')
const counter = meter.createCounter('test_counter', {
  description: 'Example of a Counter'
})
const counter2 = meter.createCounter('test_counter2', {
  description: 'Example counter with its own attributes'
  // XXX should attribute take from here? I don't see them in output. Hrm.
  //    https://opentelemetry.io/docs/reference/specification/metrics/api/#get-a-meter mentions attributes "since 1.13.0"
  //    However, the current oteljs/api/src/metrics/Meter.ts#MeterOptions does
  //    *not* include "attributes". So is OTel *JS* just behind?
  // attributes: {
  //   two: 2
  // }
})
const upDownCounter = meter.createUpDownCounter('test_up_down_counter', {
  description: 'Example of a UpDownCounter'
})
const histogram = meter.createHistogram('test_histogram', {
  description: 'Example of a Histogram'
})
const attributes = {
  // These attributes are always added as labels. Never translated to top-level fields.
  // The APM agent's own metrics add "hostname" and "env" tags -- though I think
  // one of those, at least, is pointless.
  pid: process.pid,
  environment: 'staging'
}

// // Without the attributes here. What happens?
// counter.add(1)
// counter.add(1)
// counter.add(1, { environment: 'staging', pid: process.pid })
// counter.add(1, { environment: 'dev' })

setInterval(() => {
  const tx = apm.startTransaction('cycle')
  counter.add(1, attributes)
  counter2.add(2, attributes)
  upDownCounter.add(Math.random() > 0.5 ? 1 : -1, attributes)
  histogram.record(Math.random() * 1000, attributes)
  tx.end()
}, 1000)
