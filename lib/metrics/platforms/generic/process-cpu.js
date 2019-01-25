'use strict'

const os = require('os')

const processTop = require('./process-top')()

const cpus = os.cpus()

module.exports = function processCPUUsage () {
  return processTop.cpu().percent / cpus.length
}
