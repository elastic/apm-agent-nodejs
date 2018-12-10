const os = require('os')

const cpuGauge = require('cpu-gauge')

function cpuAverage () {
  const times = {
    user: 0,
    nice: 0,
    sys: 0,
    idle: 0,
    irq: 0,
    total: 0
  }

  const cpus = os.cpus()
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      times[type] += cpu.times[type]
      times.total += cpu.times[type]
    }
  }

  // Average over CPU count
  const averages = {}
  for (const type of Object.keys(times)) {
    averages[type] = times[type] / cpus.length
  }

  return averages
}

function cpuPercent (last, next) {
  const idle = next.idle - last.idle
  const total = next.total - last.total
  return 1 - idle / total
}

let last = cpuAverage()
let percent = 1 - last.idle / last.total

setInterval(() => {
  const next = cpuAverage()
  percent = cpuPercent(last, next)
  last = next
}, 1000)

const cpu = cpuGauge.start()
const cpus = os.cpus()

module.exports = {
  get systemPercent () {
    return percent
  },

  get processPercent () {
    return cpu.usage().percent / cpus.length
  }
}
