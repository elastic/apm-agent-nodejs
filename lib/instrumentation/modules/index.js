'use strict'

var logger = require('../../logger')

var MODULES = ['http', 'https', 'mongodb-core', 'pg']

exports.patch = function (file, mod, agent) {
  if (!~MODULES.indexOf(file)) return mod

  if (mod.__opbeat_shimmed) return mod
  mod.__opbeat_shimmed = true

  logger.debug('shimming %s module', file)
  return require('./' + file)(mod, agent)
}
