'use strict'

const os = require('os')

const processTop = require('./process-top')()

const cpus = os.cpus()

exports.total = function processCPUUsageTotal () {
  return processTop.cpu().percent / cpus.length
}

exports.system = function processCPUUsageSystem () {
  const v = processTop.cpu()
  return (v.system / v.time) / cpus.length
}

exports.user = function processCPUUsageUser () {
  const v = processTop.cpu()
  return (v.user / v.time) / cpus.length
}
