'use strict'

const v8 = require('v8')

let eventLoopMonitor
try {
  const perfHooks = require('perf_hooks')
  if (typeof perfHooks.monitorEventLoopDelay !== 'function') {
    throw new Error('No builtin event loop monitor')
  }
  eventLoopMonitor = opts => perfHooks.monitorEventLoopDelay(opts)
} catch (err) {
  const EventLoopDelayHistogram = require('./event-loop-monitor')
  eventLoopMonitor = opts => new EventLoopDelayHistogram(opts)
}

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
      'system.process.cpu.system.ticks': 0,
      'system.process.cpu.user.ticks': 0,
      'nodejs.eventloop.delay': 0,
      'nodejs.memory.heap.allocated.bytes': 0,
      'nodejs.memory.heap.used.bytes': 0
    }

    const monitor = eventLoopMonitor({
      resolution: 10
    })
    monitor.enable()

    this.loopMonitor = monitor
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
    this.stats['system.process.cpu.system.ticks'] = cpu.system
    this.stats['system.process.cpu.user.ticks'] = cpu.user
    this.lastCpu = cpuUsage()

    // Event loop
    const loopDelay = Math.max(0, (this.loopMonitor.mean || 0) - 50)
    this.stats['nodejs.eventloop.delay'] = loopDelay
    this.loopMonitor.reset()

    // Heap
    const heap = v8.getHeapStatistics()
    this.stats['nodejs.memory.heap.allocated.bytes'] = heap.total_heap_size
    this.stats['nodejs.memory.heap.used.bytes'] = heap.used_heap_size
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
