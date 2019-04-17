'use strict'

const v8 = require('v8')

let getLoopDelay
try {
  const sampler = require('perf_hooks').monitorEventLoopDelay()
  sampler.enable()
  getLoopDelay = () => {
    const result = sampler.mean || 0
    sampler.reset()
    return result
  }
} catch (err) {}

const cpuUsage = typeof process.cpuUsage === 'function'
  ? process.cpuUsage.bind(process)
  : () => ({ system: 0, user: 0 })

const activeHandles = typeof process._getActiveHandles === 'function'
  ? process._getActiveHandles.bind(process)
  : () => []

const activeRequests = typeof process._getActiveRequests === 'function'
  ? process._getActiveRequests.bind(process)
  : () => []

class RuntimeCollector {
  constructor () {
    this.stats = {
      'nodejs.active_handles': 0,
      'nodejs.active_requests': 0,
      'nodejs.cpu.system': 0,
      'nodejs.cpu.user': 0,
      'nodejs.event_loop.mean_delay': 0,
      'nodejs.heap.allocated': 0,
      'nodejs.heap.used': 0
    }

    this.lastCpu = cpuUsage()
  }

  start (reportingIntervalInSeconds) {
    this.timer = setInterval(() => this.collect(), reportingIntervalInSeconds * 1000)
    this.timer.unref()
    this.collect()
  }

  stop () {
    clearInterval(this.timer)
  }

  collect () {
    // Handles and Requests
    this.stats['nodejs.active_handles'] = activeHandles().length
    this.stats['nodejs.active_requests'] = activeRequests().length

    // CPU
    const cpu = cpuUsage(this.lastCpu)
    this.stats['nodejs.cpu.system'] = cpu.system
    this.stats['nodejs.cpu.user'] = cpu.user
    this.lastCpu = cpuUsage()

    // Event loop
    if (typeof getLoopDelay === 'function') {
      this.stats['nodejs.event_loop.mean_delay'] = getLoopDelay()
    }

    // Heap
    const heap = v8.getHeapStatistics()
    this.stats['nodejs.heap.allocated'] = heap.total_heap_size
    this.stats['nodejs.heap.used'] = heap.used_heap_size
  }
}

module.exports = function createRuntimeMetrics (registry, reportingIntervalInSeconds) {
  const collector = new RuntimeCollector()
  collector.start(reportingIntervalInSeconds)
  registry.collectors.push(collector)

  for (let metric of Object.keys(collector.stats)) {
    registry.getOrCreateGauge(metric, () => collector.stats[metric])
  }
}
