'use strict'

const os = require('os')

const processTop = require('./process-top')()

const cpus = os.cpus()

module.exports = function processCPUUsage () {
  const cpu = processTop.cpu()
  return {
    total: cpu.percent / cpus.length,
    user: (cpu.user / cpu.time) / cpus.length,
    system: (cpu.system / cpu.time) / cpus.length
  }
}
