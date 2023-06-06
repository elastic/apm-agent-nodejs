/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const {
  DEFAULTS,
  ENV_TABLE,
  CENTRAL_CONFIG_OPTS,
  BOOL_OPTS,
  NUM_OPTS,
  DURATION_OPTS,
  BYTES_OPTS,
  MINUS_ONE_EQUAL_INFINITY,
  ARRAY_OPTS,
  KEY_VALUE_OPTS
} = require('./schema')

const SAMPLE_RATE_OPTS = [
  'transactionSampleRate'
]

const DEPRECATED_OPTS = [
  'filterHttpHeaders'
]

// Here starts the procedure on generation the source code from the data we already have
// initialize
const schemaObj = Object.keys(DEFAULTS).reduce((acc, key) => {
  acc[key] = { name: key, defaultValue: DEFAULTS[key] }
  return acc
}, {})

function addNormalizer (arr, normalizer) {
  arr.forEach((key) => {
    const def = schemaObj[key] || {}

    def.name = key
    def.normalizers = def.normalizers || []
    def.normalizers.push(normalizer)
    schemaObj[key] = def
  })
}

// Fill env vars
Object.keys(ENV_TABLE).forEach((key) => {
  const def = schemaObj[key] || {}
  const vars = ENV_TABLE[key]

  def.name = key
  if (Array.isArray(vars)) {
    def.envVar = vars[1]
    def.envDeprecatedVar = vars[0]
  } else {
    def.envVar = vars
  }

  schemaObj[key] = def
})

Object.keys(CENTRAL_CONFIG_OPTS).forEach((key) => {
  const config = CENTRAL_CONFIG_OPTS[key]
  const def = schemaObj[config] || {}

  def.name = config
  def.centralConfigName = key

  schemaObj[config] = def
})

addNormalizer(BOOL_OPTS, 'normalizeBool')
addNormalizer(NUM_OPTS, 'normalizeNumber')
addNormalizer(BYTES_OPTS, 'normalizeByte')
addNormalizer(MINUS_ONE_EQUAL_INFINITY, 'normalizeInfinity')
addNormalizer(ARRAY_OPTS, 'normalizeArray')
addNormalizer(KEY_VALUE_OPTS, 'normalizeKeyValuePair')
addNormalizer(SAMPLE_RATE_OPTS, 'normalizeSampleRate')

DURATION_OPTS.forEach((spec) => {
  const { name, defaultUnit, allowedUnits, allowNegative } = spec
  const def = schemaObj[name] || {}
  const unitsStr = allowedUnits.map(u => `'${u}'`).join(', ')
  def.normalizers = def.normalizers || []
  def.normalizers.push(`normalizeDuration('${defaultUnit}', [${unitsStr}], ${allowNegative})`)

  def.name = name
})

DEPRECATED_OPTS.forEach((key) => {
  const def = schemaObj[key] || {}

  def.name = key
  def.deprecated = true
  schemaObj[key] = def
})

// Print out
const schema = Object.keys(schemaObj).map((key) => schemaObj[key])
const schemaText = JSON.stringify(schema, null, 2)

function fixDoubleQuotes (line, norm) {
  return line.replace(`"${norm}"`, norm)
}

const props = [
  'name',
  'defaultValue',
  'envVar',
  'envDeprecatedVar',
  'centralConfigName',
  'normalizers',
  'normalizeBool',
  'normalizeByte',
  'normalizeNumber',
  'normalizeInfinity',
  'normalizeArray',
  'normalizeKeyValuePair',
  'normalizeSampleRate',
  'deprecated'
]
const schemaSource = schemaText.split('\n').map((line) => {
  props.forEach((p) => { line = fixDoubleQuotes(line, p) })

  line = line.replace(/"normalizeDuration\((.+)\)"/, (match, group1) => `normalizeDuration(${group1})`)
  line = line.replace(/"/g, "'")
  return line
})

console.log(`/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const {
  normalizeBool,
  normalizeByte,
  normalizeNumber,
  normalizeInfinity,
  normalizeDuration,
  normalizeArray,
  normalizeKeyValuePair,
  normalizeSampleRate
  // TODO: update path
} = require('../../../lib/config/normalizers')

/**
 * @typedef {Object} OptionDefinition
 * @property {String} name the name of the configuration option
 * @property {String | undefined} envVar the name of the environment varaiable associated with the option
 * @property {String | undefined} envDeprecatedVar the name of the deprecated environment varaiable associated with the option
 * @property {any} defaultValue the default value of the property or undefined
 * @property {Array<Function>} normalizers the list of normalizers to appyl in order to get the final value of the option
 */

/**
 * @type Array<OptionDefinition>
 */
const CONFIG_SCHEMA = ${schemaSource.join('\n')}

// Exports
module.exports = {
  CONFIG_SCHEMA
}
`)
