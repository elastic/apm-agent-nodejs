'use strict'

const v8 = require('v8')

const eventLoopMonitor = require('monitor-event-loop-delay')

const cpuUsage = typeof process.cpuUsage === 'function'
  ? process.cpuUsage.bind(process)
  : () => ({ system: 0, user: 0 })

const activeHandles = typeof process._getActiveHandles === 'function'
  ? process._getActiveHandles.bind(process)
  : () => []

const activeRequests = typeof process._getActiveRequests === 'function'
  ? process._getActiveRequests.bind(process)
  : () => []

const eventLoopMonitorResolution = 10

class RuntimeCollector {
  constructor () {
    this.stats = {
      'nodejs.active_handles': 0,
      'nodejs.active_requests': 0,
      'system.process.cpu.system.ticks': 0,
      'system.process.cpu.user.ticks': 0,
      'nodejs.eventloop.delay.ns': 0,
      'nodejs.memory.heap.allocated.bytes': 0,
      'nodejs.memory.heap.used.bytes': 0
    }

    const monitor = eventLoopMonitor({
      resolution: eventLoopMonitorResolution
    })
    monitor.enable()

    this.loopMonitor = monitor
    this.lastCpu = cpuUsage()
    this.collect()
  }

  collect () {
    // Handles and Requests
    this.stats['nodejs.active_handles'] = activeHandles().length
    this.stats['nodejs.active_requests'] = activeRequests().length

    // CPU
    const cpu = cpuUsage()
    this.stats['system.process.cpu.system.ticks'] = cpu.system - this.lastCpu.system
    this.stats['system.process.cpu.user.ticks'] = cpu.user - this.lastCpu.user
    this.lastCpu = cpu

    // Event loop
    const loopDelay = Math.max(0, ((this.loopMonitor.mean || 0) / 1e6) - eventLoopMonitorResolution)
    this.stats['nodejs.eventloop.delay.avg.ms'] = loopDelay
    this.loopMonitor.reset()

    // Heap
    const heap = v8.getHeapStatistics()
    this.stats['nodejs.memory.heap.allocated.bytes'] = heap.total_heap_size
    this.stats['nodejs.memory.heap.used.bytes'] = heap.used_heap_size
  }
}

module.exports = function createRuntimeMetrics (registry) {
  const collector = new RuntimeCollector()

  for (let metric of Object.keys(collector.stats)) {
    registry.getOrCreateGauge(metric, () => collector.stats[metric])
  }

  return collector
}
