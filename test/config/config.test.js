/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var fs = require('fs')
var os = require('os')
var path = require('path')

var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
const test = require('tape')

const AGENT_VERSION = require('../../package.json').version

const Agent = require('../../lib/agent')
const { createMockLogger } = require('../_mock_logger')
const { NoopApmClient } = require('../../lib/apm-client/noop-apm-client')

test('#printLoggingPreamble()', function (t) {
  const loggerCalls = []
  const logger = createMockLogger(loggerCalls)
  const agent = new Agent()
  const origApiReqSize = process.env.ELASTIC_APM_API_REQUEST_SIZE

  // Set options via env
  process.env.ELASTIC_APM_API_REQUEST_SIZE = '1024kb'

  // Set options via file
  const tmpDirPath = path.join(os.tmpdir(), 'elastic-apm-node-test', String(Date.now()))
  const tmpFilePath = path.join(tmpDirPath, 'elastic-apm-node-config.js')
  const tmpConfigOptions = {
    apiRequestSize: '256kb',
    apiRequestTime: '5s',
    captureExceptions: false
  }
  mkdirp.sync(tmpDirPath)
  fs.writeFileSync(tmpFilePath, `module.exports = ${JSON.stringify(tmpConfigOptions, null, 2)}`)
  t.on('end', function () { rimraf.sync(tmpDirPath) })

  // And set start options
  agent.start({
    apiRequestSize: '512kb',
    apiRequestTime: '10s',
    apiKey: ' a-secret-key',
    configFile: tmpFilePath,
    secretToken: 'secret-token',
    serverUrl: 'https://server-url',
    transport: () => new NoopApmClient(),
    logger
  })

  const infoLog = loggerCalls.find(log => log.type === 'info')
  const preambleHeader = infoLog && infoLog.message
  const preambleData = infoLog.mergingObject

  t.ok(preambleHeader.indexOf('Elastic APM Node.js Agent, version:') !== -1, 'preamble header is logged')
  t.ok(preambleData.agentVersion === AGENT_VERSION, 'agent version is present')
  t.deepEqual(
    preambleData.config.apiRequestSize,
    {
      source: 'environment',
      sourceValue: '1024kb',
      normalizedValue: 1024 * 1024
    },
    'apiRequestSize is taken from environment'
  )
  t.deepEqual(
    preambleData.config.apiRequestTime,
    {
      source: 'start',
      sourceValue: '10s',
      normalizedValue: 10
    },
    'apiRequestTime is taken from start options'
  )
  t.deepEqual(
    preambleData.config.captureExceptions,
    {
      source: 'file',
      sourceValue: false,
      normalizedValue: false,
      file: tmpFilePath
    },
    'captureExceptions is taken from file options'
  )
  t.ok(!('logger' in preambleData.config), 'logger is not in preamble')
  t.ok(!('transport' in preambleData.config), 'transport is not in preamble')

  agent.destroy()

  process.env.ELASTIC_APM_API_REQUEST_SIZE = origApiReqSize
  t.end()
})
