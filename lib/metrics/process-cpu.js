'use strict'

const os = require('os')

const cpuGauge = require('cpu-gauge')

const cpu = cpuGauge.start()
const cpus = os.cpus()

module.exports = function processCPUUsage () {
  return cpu.usage().percent / cpus.length
}
