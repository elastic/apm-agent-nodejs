'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const git = require('git-rev')
const afterAll = require('after-all-results')

const outputFile = path.resolve(process.argv[2])
const [bench, control] = process.argv.slice(3)
  .map(file => fs.readFileSync(file))
  .map(buf => JSON.parse(buf))

bench.controlStats = control.stats

calculateDelta(bench, control)

storeResult()

function storeResult () {
  const next = afterAll(function (err, [rev, branch]) {
    if (err) throw err

    const result = fs.existsSync(outputFile) ? require(outputFile) : {
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

    const json = JSON.stringify(result)

    fs.writeFile(outputFile, json, function (err) {
      if (err) throw err
    })
  })

  git.short(next().bind(null, null))
  git.branch(next().bind(null, null))
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
