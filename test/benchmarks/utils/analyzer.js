'use strict'

const fs = require('fs')
const os = require('os')
const joinPath = require('path').join
const numeral = require('numeral')
const columnify = require('columnify')
const git = require('git-rev')
const afterAll = require('after-all-results')

const [bench, control, serverMetrics] = process.argv.slice(2)
  .map(file => fs.readFileSync(file))
  .map(buf => JSON.parse(buf))
  .map(processRawResults)

calculateSingle(bench)
calculateSingle(control)
calculateSingle(serverMetrics)
calculateDelta(bench, control)

displayResult()
storeResult()

function displayResult () {
  console.log()
  console.log('Benchmark running time: %d seconds', duration(bench))
  console.log('Server running time: %d seconds', duration(serverMetrics))
  console.log('Avg bytes per event:', format(serverMetrics.metrics.bytes.count / serverMetrics.metrics.events.count))

  const opts = {
    config: {
      rate: { align: 'right' },
      total: { align: 'right' },
      single: { align: 'right' },
      overhead: { align: 'right' }
    }
  }
  console.log(`\n${columnify(output(bench, serverMetrics), opts)}\n`)
}

function storeResult () {
  const next = afterAll(function ([rev, branch]) {
    const file = joinPath(__dirname, '..', '.tmp', 'result.json')

    const result = fs.existsSync(file) ? require(file) : {
      os: {
        arch: os.arch(),
        cpus: os.cpus(),
        freemem: os.freemem(),
        homedir: os.homedir(),
        hostname: os.hostname(),
        loadavg: os.loadavg(),
        platform: os.platform(),
        release: os.release(),
        totalmem: os.totalmem(),
        type: os.type(),
        uptime: os.uptime()
      },
      process: {
        arch: process.arch,
        config: process.config,
        env: process.env,
        platform: process.platform,
        release: process.release,
        version: process.version,
        versions: process.versions
      },
      repo: {
        rev,
        branch
      },
      results: []
    }

    result.results.push(bench)
    result.results.push(serverMetrics)

    const json = JSON.stringify(result)

    fs.writeFile(file, json, function (err) {
      if (err) throw err
      console.log()
      console.log('Stored Elasticsearch result document at:', file)
    })
  })

  git.short(next())
  git.branch(next())
}

function calculateSingle (bench) {
  const time = bench.duration.count
  Object.entries(bench.metrics).forEach(([metric, count]) => {
    const single = time / count
    bench.metrics[metric] = { count, single }
  })
}

function calculateDelta (bench, control) {
  Object.keys(bench.metrics).forEach(metric => {
    bench.metrics[metric].overhead = bench.metrics[metric].single - control.metrics[metric].single
    bench.metrics[metric].singleControl = control.metrics[metric].single
  })
}

function processRawResults (log) {
  const hrtime = log.duration

  log.duration = {
    count: (hrtime[0] * 1e9 + hrtime[1]) / 1e3,
    unit: 'μs'
  }

  return log
}

function output (...logs) {
  return logs.map(log => {
    const seconds = duration(log)
    const unit = log.duration.unit

    return Object.entries(log.metrics).map(([name, metric]) => {
      const cols = {
        metric: name,
        rate: `${format(metric.count / seconds)}/s`,
        total: format(metric.count, false),
        single: `${format(metric.single)} ${unit}`
      }
      if (metric.overhead) {
        cols.overhead = `${format(metric.overhead)} ${unit}`
      }
      return cols
    })
  }).flat()
}

function duration (metrics) {
  return metrics.duration.count / 1e6
}

function format (n, decimals) {
  if (decimals === undefined) decimals = true
  return numeral(n).format(decimals ? '0,0.00' : '0,0')
}
