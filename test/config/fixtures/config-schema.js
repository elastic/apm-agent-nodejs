/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const {
  // CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  CENTRAL_CONFIG_OPTS,
  DEFAULTS,
  DURATION_OPTS,
  ENV_TABLE,
  BOOL_OPTS,
  NUM_OPTS,
  BYTES_OPTS,
  MINUS_ONE_EQUAL_INFINITY,
  ARRAY_OPTS,
  KEY_VALUE_OPTS
} = require('../../../lib/config/schema')

// Create schema for tests
const CONFIG_SCHEMA = Object.keys(DEFAULTS).reduce((acc, key) => {
  acc[key] = { name: key, defaultValue: DEFAULTS[key] }
  return acc
}, {})

// Fill env vars
Object.keys(ENV_TABLE).forEach((key) => {
  const def = CONFIG_SCHEMA[key] || {}
  const vars = ENV_TABLE[key]

  def.name = key
  if (Array.isArray(vars)) {
    def.envDeprecatedVar = vars[0]
    def.envVar = vars[1]
  } else {
    def.envVar = vars
  }

  CONFIG_SCHEMA[key] = def
})

Object.keys(CENTRAL_CONFIG_OPTS).forEach((key) => {
  const config = CENTRAL_CONFIG_OPTS[key]
  const def = CONFIG_SCHEMA[config] || {}

  def.name = config
  def.centralConfig = key
  CONFIG_SCHEMA[config] = def
})

DURATION_OPTS.forEach((spec) => {
  const { name, defaultUnit, allowedUnits, allowNegative } = spec
  const def = CONFIG_SCHEMA[name] || {}

  def.types = def.types || []
  def.types.push(`duration(${JSON.stringify({ defaultUnit, allowedUnits, allowNegative })})`)
  def.name = name
})

addType(BOOL_OPTS, 'boolean')
addType(NUM_OPTS, 'number')
addType(BYTES_OPTS, 'byte')
addType(MINUS_ONE_EQUAL_INFINITY, 'infinity')
addType(ARRAY_OPTS, 'array')
addType(KEY_VALUE_OPTS, 'keyValuePair')

function addType (arr, normalizer) {
  arr.forEach((key) => {
    const def = CONFIG_SCHEMA[key] || {}

    def.name = key
    def.types = def.types || []
    def.types.push(normalizer)
    CONFIG_SCHEMA[key] = def
  })
}

// Config options definition database
const CONFIG_DEFINITIONS = Object.keys(CONFIG_SCHEMA).map((key) => CONFIG_SCHEMA[key])

module.exports = {
  CONFIG_DEFINITIONS
}
