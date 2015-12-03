'use strict'

var debug = require('debug')('opbeat')

var MODULES = ['http', 'https', 'mongodb-core', 'pg', 'hapi']

exports.patch = function (file, mod, agent) {
  if (!~MODULES.indexOf(file)) return mod

  if (mod.__opbeat_shimmed) return mod
  mod.__opbeat_shimmed = true

  debug('shimming %s module', file)
  return require('./' + file)(mod, agent)
}
