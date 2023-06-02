/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const fs = require('fs')
const version = require('../../package').version
const logging = require('../logging')
const { INTAKE_STRING_MAX_SIZE } = require('../config/schema')
const { CloudMetadata } = require('../cloud-metadata')
const { isLambdaExecutionEnvironment } = require('../lambda')
const { isAzureFunctionsEnvironment, getAzureFunctionsExtraMetadata } = require('../instrumentation/azure-functions')

/**
 * Returns a HTTP client configuration based on agent configuration options
 *
 * @param {Object} conf The agent configuration object
 * @param {Object} agent
 * @returns {Object}
 */
function getHttpClientConfig (conf, agent) {
  let clientLogger = null
  if (!logging.isLoggerCustom(agent.logger)) {
    // https://www.elastic.co/guide/en/ecs/current/ecs-event.html#field-event-module
    clientLogger = agent.logger.child({ 'event.module': 'apmclient' })
  }
  const isLambda = isLambdaExecutionEnvironment()

  const clientConfig = {
    agentName: 'nodejs',
    agentVersion: version,
    agentActivationMethod: agent._agentActivationMethod,
    serviceName: conf.serviceName,
    serviceVersion: conf.serviceVersion,
    frameworkName: conf.frameworkName,
    frameworkVersion: conf.frameworkVersion,
    globalLabels: maybePairsToObject(conf.globalLabels),
    hostname: conf.hostname,
    environment: conf.environment,

    // Sanitize conf
    truncateKeywordsAt: INTAKE_STRING_MAX_SIZE,
    truncateLongFieldsAt: conf.longFieldMaxLength,
    // truncateErrorMessagesAt: see below

    // HTTP conf
    secretToken: conf.secretToken,
    apiKey: conf.apiKey,
    userAgent: userAgentFromConf(conf),
    serverUrl: conf.serverUrl,
    serverCaCert: loadServerCaCertFile(conf.serverCaCertFile),
    rejectUnauthorized: conf.verifyServerCert,
    serverTimeout: conf.serverTimeout * 1000,

    // APM Agent Configuration via Kibana:
    centralConfig: conf.centralConfig,

    // Streaming conf
    size: conf.apiRequestSize,
    time: conf.apiRequestTime * 1000,
    maxQueueSize: conf.maxQueueSize,

    // Debugging/testing options
    logger: clientLogger,
    payloadLogFile: conf.payloadLogFile,
    apmServerVersion: conf.apmServerVersion,

    // Container conf
    containerId: conf.containerId,
    kubernetesNodeName: conf.kubernetesNodeName,
    kubernetesNamespace: conf.kubernetesNamespace,
    kubernetesPodName: conf.kubernetesPodName,
    kubernetesPodUID: conf.kubernetesPodUID
  }

  // `service_node_name` is ignored in Lambda and Azure Functions envs.
  if (conf.serviceNodeName) {
    if (isLambda) {
      agent.logger.warn({ serviceNodeName: conf.serviceNodeName }, 'ignoring "serviceNodeName" config setting in Lambda environment')
    } else if (isAzureFunctionsEnvironment) {
      agent.logger.warn({ serviceNodeName: conf.serviceNodeName }, 'ignoring "serviceNodeName" config setting in Azure Functions environment')
    } else {
      clientConfig.serviceNodeName = conf.serviceNodeName
    }
  }

  // Extra metadata handling.
  if (isLambda) {
    // Tell the Client to wait for a subsequent `.setExtraMetadata()` call
    // before allowing intake requests. This will be called by `apm.lambda()`
    // on first Lambda function invocation.
    clientConfig.expectExtraMetadata = true
  } else if (isAzureFunctionsEnvironment) {
    clientConfig.extraMetadata = getAzureFunctionsExtraMetadata()
  } else if (conf.cloudProvider !== 'none') {
    clientConfig.cloudMetadataFetcher = new CloudMetadata(conf.cloudProvider, conf.logger, conf.serviceName)
  }

  if (conf.errorMessageMaxLength !== undefined) {
    // As of v10 of the http client, truncation of error messages will default
    // to `truncateLongFieldsAt` if `truncateErrorMessagesAt` is not specified.
    clientConfig.truncateErrorMessagesAt = conf.errorMessageMaxLength
  }

  return clientConfig
}

// Return the User-Agent string the agent will use for its comms to APM Server.
//
// Per https://github.com/elastic/apm/blob/main/specs/agents/transport.md#user-agent
// the pattern is roughly this:
//    $repoName/$version ($serviceName $serviceVersion)
//
// The format of User-Agent is governed by https://datatracker.ietf.org/doc/html/rfc7231.
//    User-Agent = product *( RWS ( product / comment ) )
// We do not expect `$repoName` and `$version` to have surprise/invalid values.
// From `validateServiceName` above, we know that `$serviceName` is null or a
// string limited to `/^[a-zA-Z0-9 _-]+$/`. However, `$serviceVersion` is
// provided by the user and could have invalid characters.
//
// `comment` is defined by
// https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6 as:
//    comment        = "(" *( ctext / quoted-pair / comment ) ")"
//    obs-text       = %x80-FF
//    ctext          = HTAB / SP / %x21-27 / %x2A-5B / %x5D-7E / obs-text
//    quoted-pair    = "\" ( HTAB / SP / VCHAR / obs-text )
//
// `commentBadChar` below *approximates* these rules, and is used to replace
// invalid characters with '_' in the generated User-Agent string. This
// replacement isn't part of the APM spec.
function userAgentFromConf (conf) {
  let userAgent = `apm-agent-nodejs/${version}`

  // This regex *approximately* matches the allowed syntax for a "comment".
  // It does not handle "quoted-pair" or a "comment" in a comment.
  const commentBadChar = /[^\t \x21-\x27\x2a-\x5b\x5d-\x7e\x80-\xff]/g
  const commentParts = []
  if (conf.serviceName) {
    commentParts.push(conf.serviceName)
  }
  if (conf.serviceVersion) {
    commentParts.push(conf.serviceVersion.replace(commentBadChar, '_'))
  }
  if (commentParts.length > 0) {
    userAgent += ` (${commentParts.join(' ')})`
  }

  return userAgent
}

/**
 * Reads te server CA cert file and returns a buffer with its contents
 * @param {string | undefined} serverCaCertFile
 * @param {any} logger
 * @returns {Buffer}
 */
function loadServerCaCertFile (serverCaCertFile, logger) {
  if (serverCaCertFile) {
    try {
      return fs.readFileSync(serverCaCertFile)
    } catch (err) {
      logger.error('Elastic APM initialization error: Can\'t read server CA cert file %s (%s)', serverCaCertFile, err.message)
    }
  }
}

function maybePairsToObject (pairs) {
  return pairs ? pairsToObject(pairs) : undefined
}

function pairsToObject (pairs) {
  return pairs.reduce((object, [key, value]) => {
    object[key] = value
    return object
  }, {})
}

module.exports = {
  getHttpClientConfig,
  userAgentFromConf
}
