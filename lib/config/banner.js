/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const os = require('os')
const path = require('path')

const AGENT_VERSION = require('../../package').version
const { REDACTED } = require('../constants')

const REDACT_OPTIONS = {
  secretToken: true,
  apKey: true
}

function printBanner (logger, sources) {
  // 1st merge config sources
  const mergedConf = Object.assign.apply(null, sources.map(s => s.options))

  // Agent
  logger.log(`Elastic APM Node.js Agent, version: ${AGENT_VERSION}, build date: {{TBD}}`)

  // Environment
  // naive offset impl (we should use Intl if available)
  const timeOffset = Math.floor(-((new Date()).getTimezoneOffset() / 60))
  const timeOffsetStr = timeOffset < 0 ? `${timeOffset}` : `+${timeOffset}`
  const environmentMessage = [
    'Environment:',
    '- process ID: ' + process.pid,
    '- process name:' + process.title,
    // TODO: check sec concerns
    // '- command line:' + process.cwd(),
    '- operating system:' + os.release(),
    '- cpu architecture:' + os.arch(),
    '- host:' + os.hostname(),
    '- time zone: UTC' + timeOffsetStr,
    '- runtime name: ' + timeOffsetStr
  ]

  if (mergedConf.frameWorkName) {
    environmentMessage.push('- framework name:' + mergedConf.frameWorkName)
  }
  logger.log(environmentMessage.join('\n'))

  // Config
  // This is wrong
  const confFile = sources[2].options.confFile
  const confPath = path.resolve(confFile || process.env.ELASTIC_APM_CONFIG_FILE || 'elastic-apm-node.js')
  const optionsMessage = [
    'Agent Configuration:',
    '- configuration files used:',
    '  - ' + confPath
  ]

  for (const key of Object.keys(mergedConf)) {
    const source = sources.find(s => (key in s.options))
    const sourceName = source && source.name
    const value = sourceName in REDACT_OPTIONS ? REDACTED : source.options[key]

    optionsMessage.push(`- ${key}: ${value.toString()} (${sourceName})`)
  }

  logger.log(optionsMessage.join('\n'))
}

module.exports = {
  printBanner
}
