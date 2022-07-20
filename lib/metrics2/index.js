/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics-base')
const { ExportResultCode } = require('@opentelemetry/core')
const eventLoopMonitor = require('monitor-event-loop-delay')

const eventLoopMonitorResolution = 10

/**
 * The `timestamp` in a metricset for APM Server intake is "UTC based and
 * formatted as microseconds since Unix epoch".
 */
function metricTimestampFromOTelHrTime (otelHrTime) {
  // OTel's HrTime is `[<seconds since unix epoch>, <nanoseconds>]`
  return Math.round(otelHrTime[0] * 1e6 + otelHrTime[1] / 1e3)
}

/**
 * XXX
 * implements PushMetricExporter
 */
class ApmMetricExporter {
  constructor (agent) {
    this._agent = agent
  }

  // export1 (resourceMetrics, resultCallback) { // XXX
  //   console.log('XXX ApmMetricExporter.export')
  //   console.dir(resourceMetrics, { depth: 10 })
  //   return resultCallback({ code: ExportResultCode.SUCCESS })
  // }

  // // Adapted from https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.27.0/experimental/packages/opentelemetry-sdk-metrics-base/src/export/ConsoleMetricExporter.ts
  // export2 (resourceMetrics, resultCallback) { // XXX
  //   for (const scopeMetrics of resourceMetrics.scopeMetrics) {
  //     for (const metricData of scopeMetrics.metrics) {
  //       for (const dataPoint of metricData.dataPoints) {
  //         console.log('-- dataPoint')
  //         console.log('metricData.descriptor:', metricData.descriptor)
  //         console.log('dataPoint.attributes:', dataPoint.attributes)
  //         console.log('dataPoint.endTime:', dataPoint.endTime)
  //         console.log('dataPoint.value:', dataPoint.value)
  //       }
  //     }
  //   }
  //   return resultCallback({ code: ExportResultCode.SUCCESS })
  // }

  // export3 (resourceMetrics, resultCallback) {
  //   console.log('XXX ApmMetricExporter.export')
  //   console.dir(resourceMetrics, { depth: 10 }) // XXX
  //   for (const scopeMetrics of resourceMetrics.scopeMetrics) {
  //     for (const metricData of scopeMetrics.metrics) {
  //       for (const dataPoint of metricData.dataPoints) {
  //         const sample = {
  //           value: dataPoint.value
  //           // XXX type?, unit?, handle Histogram (counts, values)
  //         }
  //         const metricset = {
  //           samples: {
  //             [metricData.descriptor.name]: sample
  //           },
  //           timestamp: metricTimestampFromOTelHrTime(dataPoint.endTime),
  //           tags: Object.assign(dataPoint.attributes) // XXX clone needed?
  //         }
  //         console.log('XXX sendMetricSet: ', metricset)
  //         this._agent._transport.sendMetricSet(metricset)
  //       }
  //     }
  //   }
  //   return resultCallback({ code: ExportResultCode.SUCCESS })
  // }

  // This is a version of `export3` that does the best-effort grouping for similar tags.
  // This should reduce duplication for the common case.
  export (resourceMetrics, resultCallback) {
    let currLabelsHash
    let currMetricset
    for (const scopeMetrics of resourceMetrics.scopeMetrics) {
      for (const metricData of scopeMetrics.metrics) {
        for (const dataPoint of metricData.dataPoints) {
          const sample = {
            value: dataPoint.value
            // XXX type?, unit?, handle Histogram (counts, values)
          }
          // XXX We are assuming dataPoint.endTime is identical for all resourceMetrics. Is that true?
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

  selectAggregationTemporality (_instrumentType) {
    // XXX I do not have an good at all understanding of what is required here, esp.
    //     when we get into the various instrument types.
    return AggregationTemporality.CUMULATIVE
  }

  async forceFlush () {
    console.log('XXX ApmMetricExporter.forceFlush')
  }

  async shutdown () {
    console.log('XXX ApmMetricExporter.shutdown')
  }
}

class Metrics {
  constructor (agent) {
    this._agent = agent
    this._meterProvider = null
    this._meter = null
  }

  start (refTimers) {
    const metricsInterval = this._agent._conf.metricsInterval
    const enabled = metricsInterval !== 0 && !this._agent._conf.contextPropagationOnly
    if (enabled) {
      this._meterProvider = new MeterProvider({
        // XXX I think we do not require a Resource here because, as long as we
        //     are sending metrics via APM Server's intake API, then all the
        //     "metadata" fields are added to metric documents in ES.
        //     If this is to be used for the OTel Bridge that might export
        //     metrics via OTLP, then that changes things.
      })
      this._meterProvider.addMetricReader(
        new PeriodicExportingMetricReader({
          exporter: new ApmMetricExporter(this._agent),
          exportIntervalMillis: metricsInterval * 1000,
          exportTimeoutMillis: metricsInterval / 2 * 1000
        })
      )
      this._meter = this._meterProvider.getMeter('elastic-apm-node') // XXX add agent version arg here?

      // Add default metrics collectors.
      this._addRuntimeMetrics()
    }
  }

  stop () {
    if (this._meterProvider) {
      // XXX This returns a promise. Do we need/care to await it?
      this._meterProvider.shutdown()
      this._meterProvider = null
      this._meter = null
    }
  }

  _addRuntimeMetrics () {
    if (typeof process._getActiveHandles === 'function') {
      this._meter.createObservableGauge('nodejs.handles.active')
        .addCallback(async (observableResult) => {
          observableResult.observe(process._getActiveHandles().length)
        })
    }
    if (typeof process._getActiveRequests === 'function') {
      this._meter.createObservableGauge('nodejs.requests.active')
        .addCallback(async (observableResult) => {
          observableResult.observe(process._getActiveRequests().length)
        })
    }

    const elMonitor = eventLoopMonitor({ resolution: eventLoopMonitorResolution })
    elMonitor.enable()
    this._meter.createObservableGauge('nodejs.eventloop.delay.avg.ms')
      .addCallback(async (observableResult) => {
        const loopDelay = Math.max(0, ((elMonitor.mean || 0) / 1e6) - eventLoopMonitorResolution)
        observableResult.observe(loopDelay)
        elMonitor.reset()
      })

    const memoryGauges = [
      'nodejs.memory.heap.allocated.bytes',
      'nodejs.memory.heap.used.bytes',
      'nodejs.memory.external.bytes',
      'nodejs.memory.arrayBuffers.bytes'
    ].map(name => this._meter.createObservableGauge(name))
    this._meter.addBatchObservableCallback(async (batchObservableResult) => {
      const memoryUsage = process.memoryUsage()
      batchObservableResult.observe(memoryGauges[0], memoryUsage.heapTotal)
      batchObservableResult.observe(memoryGauges[1], memoryUsage.heapUsed)
      batchObservableResult.observe(memoryGauges[2], memoryUsage.external)
      // `.arrayBuffers` is only available in NodeJS +13.0.
      batchObservableResult.observe(memoryGauges[3], memoryUsage.arrayBuffers || 0)
    }, memoryGauges)
  }

  getOrCreateCounter (...args) {
    throw new Error('XXX')
    // if (!this[registrySymbol]) {
    //   return
    // }
    // return this[registrySymbol].getOrCreateCounter(...args)
  }

  incrementCounter (name, dimensions, amount = 1) {
    throw new Error('XXX')
    // if (!this[registrySymbol]) {
    //   return
    // }

    // this.getOrCreateCounter(name, dimensions).inc(amount)
  }

  getOrCreateGauge (name, cb, labels) {
    // XXX @otel/sdk-metrics-base requires attributes to be string=>string map.
    //     elastic-apm-node allows this:
    //           type LabelValue = string | number | boolean | null | undefined;
    //           interface Labels {
    //             [key: string]: LabelValue;
    //           }
    //      TODO: grok if this is a blocker!!!
    const gauge = this._meter.createObservableGauge(name)
    gauge.addCallback(async (observableResult) => {
      observableResult.observe(cb(), labels)
    })
    return gauge
  }

  // factory function for creating a queue metrics collector
  //
  // called from instrumentation, only when the agent receives a queue message
  createQueueMetricsCollector (queueOrTopicName) {
    throw new Error('XXX')
    // if (!this[registrySymbol]) {
    //   return
    // }
    // const collector = createQueueMetrics(queueOrTopicName, this[registrySymbol])
    // return collector
  }
}

module.exports = Metrics
