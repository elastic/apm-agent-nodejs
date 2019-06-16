'use strict'

const fs = require('fs')
const os = require('os')
const joinPath = require('path').join
const numeral = require('numeral')
const columnify = require('columnify')
const git = require('git-rev')
const afterAll = require('after-all-results')

const args = process.argv.slice(2)
const appfile = args[0]
const serverfile = args[1]

const applog = JSON.parse(fs.readFileSync(appfile))
const serverlog = fs.existsSync(serverfile) && fs.statSync(serverfile).size > 0
  ? JSON.parse(fs.readFileSync(serverfile))
  : null

const agentActive = !!process.env.AGENT

const data = serverlog
  ? [].concat(
      output(applog),
      output(serverlog)
    )
  : output(applog)

displayResult()
storeResult()

function displayResult () {
  console.log()
  console.log('Benchmark running time: %d seconds', applog.seconds)
  if (agentActive && serverlog) console.log('Server running time: %d seconds', serverlog.seconds)
  if (agentActive && serverlog) console.log('Avg bytes per event:', format(serverlog.metrics.bytes / serverlog.metrics.events))

  const opts = {
    config: {
      rate: { align: 'right' },
      total: { align: 'right' }
    }
  }
  console.log(`\n${columnify(data, opts)}\n`)
}

function storeResult () {
  const next = afterAll(function ([rev, branch]) {
    const file = joinPath(__dirname, '..', '.tmp', 'result.json')

    const json = JSON.stringify({
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
      results: data
    })

    fs.writeFile(file, json, function (err) {
      if (err) throw err
      console.log()
      console.log('Stored Elasticsearch result document at:', file)
    })
  })

  git.short(next())
  git.branch(next())
}

function output (log) {
  if (!log) return
  const hrtime = log.hrtime
  log.seconds = (hrtime[0] * 1e9 + hrtime[1]) / 1e9
  return Object.entries(log.metrics).map(([metric, count]) => {
    return {
      metric,
      rate: `${format(count / log.seconds)}/s`,
      total: format(count, false)
    }
  })
}

function format (n, decimals) {
  if (decimals === undefined) decimals = true
  return numeral(n).format(decimals ? '0,0.00' : '0,0')
}
