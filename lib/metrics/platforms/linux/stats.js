'use strict'

const fs = require('fs')

class Stats {
  constructor (opts) {
    opts = opts || {}

    this.files = {
      processFile: opts.processFile || '/proc/self/stat',
      memoryFile: opts.memoryFile || '/proc/meminfo',
      cpuFile: opts.cpuFile || '/proc/stat'
    }

    this.previous = {
      cpuTotal: 0,
      cpuUsage: 0,
      memTotal: 0,
      memAvailable: 0,
      utime: 0,
      stime: 0,
      procTotalTime: 0,
      vsize: 0,
      rss: 0
    }

    this.stats = {
      'system.cpu.total.norm.pct': 0,
      'system.memory.actual.free': 0,
      'system.memory.total': 0,
      'system.process.cpu.total.norm.pct': 0,
      'system.process.cpu.system.norm.pct': 0,
      'system.process.cpu.user.norm.pct': 0,
      'system.process.memory.size': 0,
      'system.process.memory.rss.bytes': 0
    }

    this.inProgress = false
    this.timer = null

    // Do initial load
    const files = [
      this.files.processFile,
      this.files.memoryFile,
      this.files.cpuFile
    ]

    try {
      const datas = files.map(readFileSync)
      this.previous = this.readStats(datas)
      this.update(datas)
    } catch (err) {}
  }

  toJSON () {
    return this.stats
  }

  collect () {
    if (this.inProgress) return

    const files = [
      this.files.processFile,
      this.files.memoryFile,
      this.files.cpuFile
    ]

    this.inProgress = true

    return Promise.all(files.map(readFile))
      .then(files => this.update(files))
      .catch(() => {})
  }

  readStats (files) {
    const processFile = files[0]
    const memoryFile = files[1]
    const cpuFile = files[2]

    // CPU data
    let cpuTotal = 0
    let cpuUsage = 0
    let cpuLine

    for (let line of String(cpuFile).split('\n')) {
      if (/^cpu /.test(line)) {
        cpuLine = line
        break
      }
    }

    if (cpuLine) {
      const columns = cpuLine.split(/\s+/).slice(1).map(Number)

      const user = columns[0]
      const nice = columns[1]
      const system = columns[2]
      const idle = columns[3]
      const iowait = columns[4]
      const irq = columns[5]
      const softirq = columns[6]
      const steal = columns[7]

      cpuTotal = user + nice + system + idle + iowait + irq + softirq + steal
      cpuUsage = cpuTotal - (idle + iowait)
    }

    // Memory data
    let memAvailable = 0
    let memTotal = 0

    let matches = 0
    for (let line of String(memoryFile).split('\n')) {
      if (/^MemAvailable:/.test(line)) {
        memAvailable = parseInt(line.split(/\s+/)[1], 10) * 1024
        matches++
      } else if (/^MemTotal:/.test(line)) {
        memTotal = parseInt(line.split(/\s+/)[1], 10) * 1024
        matches++
      }
      if (matches === 2) break
    }

    // Process data
    let utime = 0
    let stime = 0
    let procTotalTime = 0
    let vsize = 0
    let rss = process.memoryUsage().rss

    let processLine = String(processFile).split('\n')[0]
    if (processLine) {
      // Example of line we're trying to parse:
      //
      // 44 (node /app/node_) R 1 44 44 0 -1 4210688 7948 0 0 0 109 21 0 0 20 0 10 0 133652 954462208 12906 18446744073709551615 4194304 32940036 140735797366336 0 0 0 0 4096 16898 0 0 0 17 0 0 0 0 0 0 35037200 35143856 41115648 140735797369050 140735797369131 140735797369131 140735797370852 0
      //
      // We can't just split on whitespace as the 2nd field might contain
      // whitespace. However, the parentheses will always be there, so we can
      // ignore everything from before the `)` to get rid of the whitespace
      // problem.
      //
      // For details about each field, see:
      // http://man7.org/linux/man-pages/man5/proc.5.html
      processLine = processLine.slice(processLine.indexOf(')'))
      const processData = processLine.split(/\s+/)

      // all fields are referenced by their index, but are off by one because
      // we're dropping the first field from the line due to the whitespace
      // problem described above
      utime = parseInt(processData[12], 10) // position in file: 14
      stime = parseInt(processData[13], 10) // position in file: 15
      procTotalTime = utime + stime
      vsize = parseInt(processData[21], 10) // position in file: 23
    }

    return {
      cpuUsage,
      cpuTotal,
      memTotal,
      memAvailable,
      utime,
      stime,
      procTotalTime,
      vsize,
      rss
    }
  }

  update (files) {
    const prev = this.previous
    const next = this.readStats(files)
    const stats = this.stats

    const delta = {
      cpuTotal: next.cpuTotal - prev.cpuTotal,
      cpuUsage: next.cpuUsage - prev.cpuUsage,
      procTotalTime: next.procTotalTime - prev.procTotalTime,
      stime: next.stime - prev.stime,
      utime: next.utime - prev.utime
    }
    stats['system.cpu.total.norm.pct'] = delta.cpuUsage / delta.cpuTotal || 0
    stats['system.memory.actual.free'] = next.memAvailable
    stats['system.memory.total'] = next.memTotal

    const cpuProcessPercent = delta.procTotalTime / delta.cpuTotal || 0
    const cpuProcessSystemPercent = delta.stime / delta.cpuTotal || 0
    const cpuProcessUserPercent = delta.utime / delta.cpuTotal || 0

    stats['system.process.cpu.total.norm.pct'] = cpuProcessPercent
    stats['system.process.cpu.system.norm.pct'] = cpuProcessSystemPercent
    stats['system.process.cpu.user.norm.pct'] = cpuProcessUserPercent
    stats['system.process.memory.size'] = next.vsize
    stats['system.process.memory.rss.bytes'] = next.rss

    this.previous = next
    this.inProgress = false
  }
}

function readFile (file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (err, res) => {
      err ? reject(err) : resolve(res)
    })
  })
}

function readFileSync (file) {
  return fs.readFileSync(file)
}

module.exports = Stats
