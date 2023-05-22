/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const { NoopTransport } = require('./noop-transport')
const { createElasticAPMTransport } = require('./elastic-apm-transport')

function createTransport (config, agent) {
  if (config.disableSend || config.contextPropagationOnly) {
    return new NoopTransport()
  } else if (typeof config.transport !== 'function') {
    return createElasticAPMTransport(config, agent)
  }
  return config.transport(config, agent)
}

module.exports = {
  createTransport
}
