'use strict'

const { exec } = require('child_process')
const { appendFile, readFileSync } = require('fs')
const os = require('os')
const { resolve } = require('path')

const afterAll = require('after-all-results')

const logResult = require('./result-logger')

const input = process.argv.slice(2)
const outputFile = input.length > 2 ? resolve(input.pop()) : null
const [bench, control] = input
  .map(file => readFileSync(file))
  .map(buf => JSON.parse(buf))

calculateDelta(bench, control)
logResult(bench, control)

if (outputFile) storeResult()

function storeResult () {
  bench.controlStats = control.stats

  const next = afterAll(function (err, [rev, branch, message]) {
    if (err) throw err

    const result = {
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
      git: {
        rev,
        branch,
        message
      },
      bench
    }

    appendFile(outputFile, `${JSON.stringify(result)}\n`, function (err) {
      if (err) throw err
    })
  })

  exec('git rev-parse --short HEAD | tr -d \'\\n\'', next())
  exec('git rev-parse --abbrev-ref HEAD | tr -d \'\\n\'', next())
  exec('git show -s --format=%B HEAD | tr -d \'\\n\'', next())
}

function calculateDelta (bench, control) {
  // moe: The margin of error
  // rme: The relative margin of error (expressed as a percentage of the mean)
  // sem: The standard error of the mean
  // deviation: The sample standard deviation
  // mean: The sample arithmetic mean (secs)
  // variance: The sample variance
  bench.overhead = bench.stats.mean - control.stats.mean
}
