/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// const os = require('os')
// const fs = require('fs')
const path = require('path')
// const { URL } = require('url')

// const truncate = require('unicode-byte-truncate')

// const AGENT_VERSION = require('../../package.json').version
// const REDACTED = require('../constants').REDACTED
// const logging = require('../logging')
// const { NoopApmClient } = require('../apm-client/noop-apm-client')
// const { isLambdaExecutionEnvironment } = require('../lambda')
// const { isAzureFunctionsEnvironment } = require('../instrumentation/azure-functions')

const { CONFIG_SCHEMA } = require('./schema-new')
const { createLogger } = require('../logging')

// This may change
let configFilePath = process.env.ELASTIC_APM_CONFIG_FILE || 'elastic-apm-node.js'
let configFromFile = loadConfigFile(configFilePath)

const mylogger = createLogger('info')
const config = {
  // Contains all the info about each options
  _info: {},
  // Just contains the resolved values
  _values: {}
}

function getConfig (options, logger) {
  if (!configFromFile && options.configFile) {
    configFilePath = options.configFile
    configFromFile = loadConfigFile(configFilePath)
  }
  // TODO: resolve the logger
}

function getOptionInfo (key) {
  return config._info[key]
}

function getOptionValue (key) {
  return config._values[key]
}

function setOptionValue (key, value) {
  if (key in config._values) {
    config._values[key] = value
    config._info[key].value = value
  }
}

/**
 * Resolves the value of a given option based on its definition from the schema and fomr the values
 * given from the options from file and start options
 *
 * @param {import('./schema-new').OptionDefinition} optionDef the definition of the option
 * @param {Object} optsFromFile options object coming from the configuration file
 * @param {Object} optsFromStart options object coming from the start options
 */
function resolveOption (optionDef, optsFromFile, optsFromStart) {
  const info = Object.assign({}, optionDef)
  delete info.normalizers

  const name = info.name
  let sourceValue = info.defaultValue
  // file - start - env
  if (name in optsFromFile) {
    sourceValue = optsFromFile[name]
    info.source = 'file'
  }
  if (name in optsFromStart) {
    sourceValue = optsFromStart[name]
    info.source = 'start'
  }
  if (info.envDeprecatedVar && process.env[info.envDeprecatedVar]) {
    // TODO: log for deprecation
    sourceValue = process.env[info.envDeprecatedVar]
    info.source = 'environment'
  }
  if (info.envVar && process.env[info.envVar]) {
    sourceValue = process.env[info.envVar]
    info.source = 'environment'
  }

  info.value = (optionDef.normalizers || []).reduce(function (val, fn) {
    // TODO: resolve thew logger 1st
    return fn(val, name, config._values, mylogger)
  }, sourceValue)

  // Add data to global object
  config._info[name] = info
  config._values[name] = info.value
}

/**
 * Try to load a configuration file from the given path. If the file does not exists or
 * cannot be `required` it returns undefined.
 *
 * @param {String} filePath the path to the config file
 * @returns {Object | undefined} the configuration objec or undefined if cannot be loaded
 */
function loadConfigFile (filePath) {
  if (!filePath) {
    return
  }

  try {
    return require(path.resolve(filePath))
  } catch (err) {
    console.error('Elastic APM initialization error: Can\'t read config file %s', filePath)
    console.error(err.stack)
  }
}

// Initialize from defaults in schema and the previously loaded file if present
CONFIG_SCHEMA.forEach(function (optionDef) {
  resolveOption(optionDef, {}, {})
})

// console.log(config)

module.exports = {
  getConfig,
  getOptionInfo,
  getOptionValue,
  setOptionValue
}
