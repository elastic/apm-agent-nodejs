'use strict'

var MODULES = ['http']

exports.patch = function (file, mod, client) {
  if (!~MODULES.indexOf(file)) return mod

  if (mod.__opbeat_shimmed) return mod
  mod.__opbeat_shimmed = true

  client.logger.debug('shimming %s module', file)
  return require('./' + file)(mod, client)
}
