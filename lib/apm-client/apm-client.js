/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const ElasticAPMHttpClient = require('elastic-apm-http-client')

const { CENTRAL_CONFIG_OPTS } = require('../config/schema')
const { normalize } = require('../config/config')
const logging = require('../logging')

const { NoopApmClient } = require('./noop-apm-client')
const { getHttpClientConfig } = require('./http-apm-client')

/**
 * Returns an APM client suited for the configuration provided
 *
 * @param {Object} config The agent's configuration
 * @param {Object} agent The agents instance
 */
function createApmClient (config, agent) {
  if (config.disableSend || config.contextPropagationOnly) {
    return new NoopApmClient()
  } else if (typeof config.transport === 'function') {
    return config.transport(config, agent)
  }

  const client = new ElasticAPMHttpClient(getHttpClientConfig(config, agent))

  client.on('config', remoteConf => {
    agent.logger.debug({ remoteConf }, 'central config received')
    try {
      const conf = {}
      const unknown = []

      for (const [key, value] of Object.entries(remoteConf)) {
        const newKey = CENTRAL_CONFIG_OPTS[key]
        if (newKey) {
          conf[newKey] = value
        } else {
          unknown.push(key)
        }
      }
      if (unknown.length > 0) {
        agent.logger.warn(`Central config warning: unsupported config names: ${unknown.join(', ')}`)
      }

      if (Object.keys(conf).length > 0) {
        normalize(conf, agent.logger)
        for (const [key, value] of Object.entries(conf)) {
          const oldValue = agent._conf[key]
          agent._conf[key] = value
          if (key === 'logLevel' && value !== oldValue && !logging.isLoggerCustom(agent.logger)) {
            logging.setLogLevel(agent.logger, value)
            agent.logger.info(`Central config success: updated logger with new logLevel: ${value}`)
          }
          agent.logger.info(`Central config success: updated ${key}: ${value}`)
        }
      }
    } catch (err) {
      agent.logger.error({ remoteConf, err }, 'Central config error: exception while applying changes')
    }
  })

  client.on('error', err => {
    agent.logger.error('APM Server transport error: %s', err.stack)
  })

  client.on('request-error', err => {
    const haveAccepted = Number.isFinite(err.accepted)
    const haveErrors = Array.isArray(err.errors)
    let msg

    if (err.code === 404) {
      msg = 'APM Server responded with "404 Not Found". ' +
        'This might be because you\'re running an incompatible version of the APM Server. ' +
        'This agent only supports APM Server v6.5 and above. ' +
        'If you\'re using an older version of the APM Server, ' +
        'please downgrade this agent to version 1.x or upgrade the APM Server'
    } else if (err.code) {
      msg = `APM Server transport error (${err.code}): ${err.message}`
    } else {
      msg = `APM Server transport error: ${err.message}`
    }

    if (haveAccepted || haveErrors) {
      if (haveAccepted) msg += `\nAPM Server accepted ${err.accepted} events in the last request`
      if (haveErrors) {
        for (const error of err.errors) {
          msg += `\nError: ${error.message}`
          if (error.document) msg += `\n  Document: ${error.document}`
        }
      }
    } else if (err.response) {
      msg += `\n${err.response}`
    }

    agent.logger.error(msg)
  })

  return client
}

module.exports = {
  createApmClient
}
