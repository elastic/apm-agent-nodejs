/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const fs = require('fs');
const version = require('../../package').version;
const {
  CENTRAL_CONFIG_OPTS,
  INTAKE_STRING_MAX_SIZE,
} = require('../config/schema');
const { normalize } = require('../config/config');
const { CloudMetadata } = require('../cloud-metadata');
const { isLambdaExecutionEnvironment } = require('../lambda');
const logging = require('../logging');

const { HttpApmClient } = require('./http-apm-client');
const { NoopApmClient } = require('./noop-apm-client');
const {
  isAzureFunctionsEnvironment,
  getAzureFunctionsExtraMetadata,
} = require('../instrumentation/azure-functions');

/**
 * Returns an APM client suited for the configuration provided
 *
 * @param {Object} config The agent's configuration
 * @param {Object} agent The agents instance
 */
function createApmClient(config, agent) {
  if (config.disableSend || config.contextPropagationOnly) {
    return new NoopApmClient();
  } else if (typeof config.transport === 'function') {
    return config.transport(config, agent);
  }

  const client = new HttpApmClient(getHttpClientConfig(config, agent));

  client.on('config', (remoteConf) => {
    agent.logger.debug({ remoteConf }, 'central config received');
    try {
      const conf = {};
      const unknown = [];

      for (const [key, value] of Object.entries(remoteConf)) {
        const newKey = CENTRAL_CONFIG_OPTS[key];
        if (newKey) {
          conf[newKey] = value;
        } else {
          unknown.push(key);
        }
      }
      if (unknown.length > 0) {
        agent.logger.warn(
          `Central config warning: unsupported config names: ${unknown.join(
            ', ',
          )}`,
        );
      }

      if (Object.keys(conf).length > 0) {
        normalize(conf, agent.logger);
        for (const [key, value] of Object.entries(conf)) {
          const oldValue = agent._conf[key];
          agent._conf[key] = value;
          if (
            key === 'logLevel' &&
            value !== oldValue &&
            !logging.isLoggerCustom(agent.logger)
          ) {
            logging.setLogLevel(agent.logger, value);
            agent.logger.info(
              `Central config success: updated logger with new logLevel: ${value}`,
            );
          }
          agent.logger.info(`Central config success: updated ${key}: ${value}`);
        }
      }
    } catch (err) {
      agent.logger.error(
        { remoteConf, err },
        'Central config error: exception while applying changes',
      );
    }
  });

  client.on('error', (err) => {
    agent.logger.error('APM Server transport error: %s', err.stack);
  });

  client.on('request-error', (err) => {
    const haveAccepted = Number.isFinite(err.accepted);
    const haveErrors = Array.isArray(err.errors);
    let msg;

    if (err.code === 404) {
      msg =
        'APM Server responded with "404 Not Found". ' +
        "This might be because you're running an incompatible version of the APM Server. " +
        'This agent only supports APM Server v6.5 and above. ' +
        "If you're using an older version of the APM Server, " +
        'please downgrade this agent to version 1.x or upgrade the APM Server';
    } else if (err.code) {
      msg = `APM Server transport error (${err.code}): ${err.message}`;
    } else {
      msg = `APM Server transport error: ${err.message}`;
    }

    if (haveAccepted || haveErrors) {
      if (haveAccepted)
        msg += `\nAPM Server accepted ${err.accepted} events in the last request`;
      if (haveErrors) {
        for (const error of err.errors) {
          msg += `\nError: ${error.message}`;
          if (error.document) msg += `\n  Document: ${error.document}`;
        }
      }
    } else if (err.response) {
      msg += `\n${err.response}`;
    }

    agent.logger.error(msg);
  });

  return client;
}

/**
 * Returns a HTTP client configuration based on agent configuration options
 *
 * @param {Object} conf The agent configuration object
 * @param {Object} agent
 * @returns {Object}
 */
function getHttpClientConfig(conf, agent) {
  let clientLogger = null;
  if (!logging.isLoggerCustom(agent.logger)) {
    // https://www.elastic.co/guide/en/ecs/current/ecs-event.html#field-event-module
    clientLogger = agent.logger.child({ 'event.module': 'apmclient' });
  }
  const isLambda = isLambdaExecutionEnvironment();

  const clientConfig = {
    agentName: 'nodejs',
    agentVersion: version,
    agentActivationMethod: agent._agentActivationMethod,
    serviceName: conf.serviceName,
    serviceVersion: conf.serviceVersion,
    frameworkName: conf.frameworkName,
    frameworkVersion: conf.frameworkVersion,
    globalLabels: maybePairsToObject(conf.globalLabels),
    configuredHostname: conf.hostname,
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
    kubernetesPodUID: conf.kubernetesPodUID,
  };

  // `service_node_name` is ignored in Lambda and Azure Functions envs.
  if (conf.serviceNodeName) {
    if (isLambda) {
      agent.logger.warn(
        { serviceNodeName: conf.serviceNodeName },
        'ignoring "serviceNodeName" config setting in Lambda environment',
      );
    } else if (isAzureFunctionsEnvironment) {
      agent.logger.warn(
        { serviceNodeName: conf.serviceNodeName },
        'ignoring "serviceNodeName" config setting in Azure Functions environment',
      );
    } else {
      clientConfig.serviceNodeName = conf.serviceNodeName;
    }
  }

  // Extra metadata handling.
  if (isLambda) {
    // Tell the Client to wait for a subsequent `.setExtraMetadata()` call
    // before allowing intake requests. This will be called by `apm.lambda()`
    // on first Lambda function invocation.
    clientConfig.expectExtraMetadata = true;
  } else if (isAzureFunctionsEnvironment) {
    clientConfig.extraMetadata = getAzureFunctionsExtraMetadata();
  } else if (conf.cloudProvider !== 'none') {
    clientConfig.cloudMetadataFetcher = new CloudMetadata(
      conf.cloudProvider,
      conf.logger,
      conf.serviceName,
    );
  }

  if (conf.errorMessageMaxLength !== undefined) {
    // As of v10 of the http client, truncation of error messages will default
    // to `truncateLongFieldsAt` if `truncateErrorMessagesAt` is not specified.
    clientConfig.truncateErrorMessagesAt = conf.errorMessageMaxLength;
  }

  return clientConfig;
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
function userAgentFromConf(conf) {
  let userAgent = `apm-agent-nodejs/${version}`;

  // This regex *approximately* matches the allowed syntax for a "comment".
  // It does not handle "quoted-pair" or a "comment" in a comment.
  const commentBadChar = /[^\t \x21-\x27\x2a-\x5b\x5d-\x7e\x80-\xff]/g;
  const commentParts = [];
  if (conf.serviceName) {
    commentParts.push(conf.serviceName);
  }
  if (conf.serviceVersion) {
    commentParts.push(conf.serviceVersion.replace(commentBadChar, '_'));
  }
  if (commentParts.length > 0) {
    userAgent += ` (${commentParts.join(' ')})`;
  }

  return userAgent;
}

/**
 * Reads te server CA cert file and returns a buffer with its contents
 * @param {string | undefined} serverCaCertFile
 * @param {any} logger
 * @returns {Buffer}
 */
function loadServerCaCertFile(serverCaCertFile, logger) {
  if (serverCaCertFile) {
    try {
      return fs.readFileSync(serverCaCertFile);
    } catch (err) {
      logger.error(
        "Elastic APM initialization error: Can't read server CA cert file %s (%s)",
        serverCaCertFile,
        err.message,
      );
    }
  }
}

function maybePairsToObject(pairs) {
  return pairs ? pairsToObject(pairs) : undefined;
}

function pairsToObject(pairs) {
  return pairs.reduce((object, [key, value]) => {
    object[key] = value;
    return object;
  }, {});
}

module.exports = {
  createApmClient,
  userAgentFromConf,
};
