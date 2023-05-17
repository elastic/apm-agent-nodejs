/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var fs = require('fs')
var path = require('path')

var ElasticAPMHttpClient = require('elastic-apm-http-client')
var truncate = require('unicode-byte-truncate')

const REDACTED = require('../constants').REDACTED
var logging = require('../logging')
var version = require('../../package').version

const { CloudMetadata } = require('../cloud-metadata')
const { NoopTransport } = require('../noop-transport')
const { isLambdaExecutionEnvironment } = require('../lambda')
const { isAzureFunctionsEnvironment, getAzureFunctionsExtraMetadata } = require('../instrumentation/azure-functions')

const {
  INTAKE_STRING_MAX_SIZE,
  CENTRAL_CONFIG_OPTS,
  BOOL_OPTS,
  NUM_OPTS,
  DURATION_OPTS,
  BYTES_OPTS,
  MINUS_ONE_EQUAL_INFINITY,
  ARRAY_OPTS,
  KEY_VALUE_OPTS,
  ENV_TABLE,
  DEFAULTS
} = require('./schema')

const {
  normalizeArrays,
  normalizeBools,
  normalizeBytes,
  normalizeDurationOptions,
  normalizeIgnoreOptions,
  normalizeInfinity,
  normalizeKeyValuePairs,
  normalizeNumbers,
  normalizeElasticsearchCaptureBodyUrls,
  normalizeDisableMetrics,
  normalizeSanitizeFieldNames,
  normalizeCloudProvider,
  normalizeCustomMetricsHistogramBoundaries,
  normalizeTransactionSampleRate,
  normalizeTraceContinuationStrategy,
  normalizeContextManager,
  normalizeSpanStackTraceMinDuration
} = require('./normalizers')

let confFile = loadConfigFile()

// Configure a logger for the agent.
//
// This is separate from `createConfig` to allow the agent to have an early
// logger before `agent.start()` is called.
function configLogger (opts) {
  const logLevel = (
    process.env[ENV_TABLE.logLevel] ||
    (opts && opts.logLevel) ||
    (confFile && confFile.logLevel) ||
    DEFAULTS.logLevel
  )

  // `ELASTIC_APM_LOGGER=false` is provided as a mechanism to *disable* a
  // custom logger for troubleshooting because a wrapped custom logger does
  // not get structured log data.
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/troubleshooting.html#debug-mode
  let customLogger = null
  if (process.env.ELASTIC_APM_LOGGER !== 'false') {
    customLogger = (
      (opts && opts.logger) ||
      (confFile && confFile.logger)
    )
  }

  return logging.createLogger(logLevel, customLogger)
}

// Create an initial configuration from DEFAULTS. This is used as a stand-in
// for Agent configuration until `agent.start(...)` is called.
function initialConfig (logger) {
  const cfg = Object.assign({}, DEFAULTS)

  // Reproduce the generated properties for `Config`.
  cfg.disableMetricsRegExp = []
  cfg.ignoreUrlStr = []
  cfg.ignoreUrlRegExp = []
  cfg.ignoreUserAgentStr = []
  cfg.ignoreUserAgentRegExp = []
  cfg.elasticsearchCaptureBodyUrlsRegExp = []
  cfg.transactionIgnoreUrlRegExp = []
  cfg.sanitizeFieldNamesRegExp = []
  cfg.ignoreMessageQueuesRegExp = []
  normalize(cfg, logger)

  cfg.transport = new NoopTransport()

  return cfg
}

function createConfig (opts, logger) {
  return new Config(opts, logger)
}

class Config {
  constructor (opts, logger) {
    this.disableMetricsRegExp = []
    this.ignoreUrlStr = []
    this.ignoreUrlRegExp = []
    this.ignoreUserAgentStr = []
    this.ignoreUserAgentRegExp = []
    this.elasticsearchCaptureBodyUrlsRegExp = []
    this.transactionIgnoreUrlRegExp = []
    this.sanitizeFieldNamesRegExp = []
    this.ignoreMessageQueuesRegExp = []

    const isLambda = isLambdaExecutionEnvironment()
    const envOptions = readEnv()

    // If we didn't find a config file on process boot, but a path to one is
    // provided as a config option, let's instead try to load that
    if (confFile === null && opts && opts.configFile) {
      confFile = loadConfigFile(opts.configFile)
    }

    Object.assign(
      this,
      DEFAULTS, // default options
      confFile, // options read from config file
      opts, // options passed in to agent.start()
      envOptions // options read from environment variables
    )

    // The logger is used later in this function, so create/update it first.
    // Unless a new custom `logger` was provided, we use the one created earlier
    // in `configLogger()`.
    const customLogger = (process.env.ELASTIC_APM_LOGGER === 'false' ? null : this.logger)
    if (!customLogger && logger) {
      logging.setLogLevel(logger, this.logLevel)
      this.logger = logger
    } else {
      this.logger = logging.createLogger(this.logLevel, customLogger)
    }

    // Fallback and validation handling for `serviceName` and `serviceVersion`.
    if (this.serviceName) {
      // A value here means an explicit value was given. Error out if invalid.
      try {
        validateServiceName(this.serviceName)
      } catch (err) {
        this.logger.error('serviceName "%s" is invalid: %s', this.serviceName, err.message)
        this.serviceName = null
      }
    } else {
      if (isLambda) {
        this.serviceName = process.env.AWS_LAMBDA_FUNCTION_NAME
      } else if (isAzureFunctionsEnvironment && process.env.WEBSITE_SITE_NAME) {
        this.serviceName = process.env.WEBSITE_SITE_NAME
      }
      if (this.serviceName) {
        try {
          validateServiceName(this.serviceName)
        } catch (err) {
          this.logger.warn('"%s" is not a valid serviceName: %s', this.serviceName, err.message)
          this.serviceName = null
        }
      }
      if (!this.serviceName) {
        // Zero-conf support: use package.json#name, else
        // `unknown-${service.agent.name}-service`.
        try {
          this.serviceName = serviceNameFromPackageJson()
        } catch (err) {
          this.logger.warn(err.message)
        }
        if (!this.serviceName) {
          this.serviceName = 'unknown-nodejs-service'
        }
      }
    }
    if (this.serviceVersion) {
      // pass
    } else if (isLambda) {
      this.serviceVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION
    } else if (isAzureFunctionsEnvironment && process.env.WEBSITE_SITE_NAME) {
      // Leave this empty. There isn't a meaningful service version field
      // in Azure Functions envvars, and falling back to package.json ends up
      // finding the version of the "azure-functions-core-tools" package.
    } else {
      // Zero-conf support: use package.json#version, if possible.
      try {
        this.serviceVersion = serviceVersionFromPackageJson()
      } catch (err) {
        // pass
      }
    }

    // Warn agent consumer if it passed deprecated options via ENV, start options or config file.
    const configSources = [envOptions, opts, confFile]
    for (let i = 0; i < configSources.length; i++) {
      if (configSources[i] && 'filterHttpHeaders' in configSources[i]) {
        this.logger.warn('the `filterHttpHeaders` config option is deprecated')
      }
    }

    normalize(this, this.logger)

    if (isLambda || isAzureFunctionsEnvironment) {
      // Override some config in AWS Lambda or Azure Functions environments.
      this.metricsInterval = 0
      this.cloudProvider = 'none'
      this.centralConfig = false
    }
    if (this.metricsInterval === 0) {
      this.breakdownMetrics = false
    }

    if (this.disableSend || this.contextPropagationOnly) {
      this.transport = function createNoopTransport (conf, agent) {
        return new NoopTransport()
      }
    } else if (typeof this.transport !== 'function') {
      this.transport = function httpTransport (conf, agent) {
        const config = getBaseClientConfig(conf, agent)
        var transport = new ElasticAPMHttpClient(config)

        transport.on('config', remoteConf => {
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

        transport.on('error', err => {
          agent.logger.error('APM Server transport error: %s', err.stack)
        })

        transport.on('request-error', err => {
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

        return transport
      }
    }
  }

  // Return a reasonably loggable object for this Config instance.
  // Exclude undefined fields and complex objects like `logger`.
  toJSON () {
    const EXCLUDE_FIELDS = {
      logger: true,
      transport: true
    }
    const REDACT_FIELDS = {
      apiKey: true,
      secretToken: true,
      serverUrl: true
    }
    const NICE_REGEXPS_FIELDS = {
      disableMetricsRegExp: true,
      ignoreUrlRegExp: true,
      ignoreUserAgentRegExp: true,
      transactionIgnoreUrlRegExp: true,
      sanitizeFieldNamesRegExp: true,
      ignoreMessageQueuesRegExp: true
    }
    const loggable = {}
    for (const k in this) {
      if (EXCLUDE_FIELDS[k] || this[k] === undefined) {
        // pass
      } else if (REDACT_FIELDS[k]) {
        loggable[k] = REDACTED
      } else if (NICE_REGEXPS_FIELDS[k] && Array.isArray(this[k])) {
        // JSON.stringify() on a RegExp is "{}", which isn't very helpful.
        loggable[k] = this[k].map(r => r instanceof RegExp ? r.toString() : r)
      } else {
        loggable[k] = this[k]
      }
    }
    return loggable
  }
}

function readEnv () {
  var opts = {}
  for (const key of Object.keys(ENV_TABLE)) {
    let env = ENV_TABLE[key]
    if (!Array.isArray(env)) env = [env]
    for (const envKey of env) {
      if (envKey in process.env) {
        opts[key] = process.env[envKey]
      }
    }
  }
  return opts
}

function validateServiceName (s) {
  if (typeof s !== 'string') {
    throw new Error('not a string')
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(s)) {
    throw new Error('contains invalid characters (allowed: a-z, A-Z, 0-9, _, -, <space>)')
  }
}

// findPkgInfo() looks up from the script dir (or cwd) for a "package.json" file
// from which to load the name and version. It returns:
//    {
//      startDir: "<full path to starting dir>",
//      path: "/the/full/path/to/package.json",  // may be null
//      data: {
//        name: "<the package name>",            // may be missing
//        version: "<the package version>"       // may be missing
//      }
//    }
let pkgInfoCache
function findPkgInfo () {
  if (pkgInfoCache === undefined) {
    // Determine a good starting dir from which to look for a "package.json".
    let startDir = require.main && require.main.filename && path.dirname(require.main.filename)
    if (!startDir && process.argv[1]) {
      // 'require.main' is undefined if the agent is preloaded with `node
      // --require elastic-apm-node/... script.js`.
      startDir = path.dirname(process.argv[1])
    }
    if (!startDir) {
      startDir = process.cwd()
    }
    pkgInfoCache = {
      startDir,
      path: null,
      data: {}
    }

    // Look up from the starting dir for a "package.json".
    const { root } = path.parse(startDir)
    let dir = startDir
    while (true) {
      const pj = path.resolve(dir, 'package.json')
      if (fs.existsSync(pj)) {
        pkgInfoCache.path = pj
        break
      }
      if (dir === root) {
        break
      }
      dir = path.dirname(dir)
    }

    // Attempt to load "name" and "version" from the package.json.
    if (pkgInfoCache.path) {
      try {
        const data = JSON.parse(fs.readFileSync(pkgInfoCache.path))
        if (data.name) {
          // For backward compatibility, maintain the trimming done by
          // https://github.com/npm/normalize-package-data#what-normalization-currently-entails
          pkgInfoCache.data.name = data.name.trim()
        }
        if (data.version) {
          pkgInfoCache.data.version = data.version
        }
      } catch (_err) {
        // Silently leave data empty.
      }
    }
  }
  return pkgInfoCache
}

function serviceNameFromPackageJson () {
  const pkg = findPkgInfo()
  if (!pkg.path) {
    throw new Error(`could not infer serviceName: could not find package.json up from ${pkg.startDir}`)
  }
  if (!pkg.data.name) {
    throw new Error(`could not infer serviceName: "${pkg.path}" does not contain a "name"`)
  }
  if (typeof pkg.data.name !== 'string') {
    throw new Error(`could not infer serviceName: "name" in "${pkg.path}" is not a string`)
  }
  let serviceName = pkg.data.name

  // Normalize a namespaced npm package name, '@ns/name', to 'ns-name'.
  const match = /^@([^/]+)\/([^/]+)$/.exec(serviceName)
  if (match) {
    serviceName = match[1] + '-' + match[2]
  }

  // Sanitize, by replacing invalid service name chars with an underscore.
  const SERVICE_NAME_BAD_CHARS = /[^a-zA-Z0-9 _-]/g
  serviceName = serviceName.replace(SERVICE_NAME_BAD_CHARS, '_')

  // Disallow some weird sanitized values. For example, it is better to
  // have the fallback "unknown-{service.agent.name}-service" than "_" or
  // "____" or " ".
  const ALL_NON_ALPHANUMERIC = /^[ _-]*$/
  if (ALL_NON_ALPHANUMERIC.test(serviceName)) {
    serviceName = null
  }
  if (!serviceName) {
    throw new Error(`could not infer serviceName from name="${pkg.data.name}" in "${pkg.path}"`)
  }

  return serviceName
}

function serviceVersionFromPackageJson () {
  const pkg = findPkgInfo()
  if (!pkg.path) {
    throw new Error(`could not infer serviceVersion: could not find package.json up from ${pkg.startDir}`)
  }
  if (!pkg.data.version) {
    throw new Error(`could not infer serviceVersion: "${pkg.path}" does not contain a "version"`)
  }
  if (typeof pkg.data.version !== 'string') {
    throw new Error(`could not infer serviceVersion: "version" in "${pkg.path}" is not a string`)
  }
  return pkg.data.version
}

function normalize (opts, logger) {
  normalizeKeyValuePairs(opts, KEY_VALUE_OPTS, DEFAULTS, logger)
  normalizeNumbers(opts, NUM_OPTS, DEFAULTS, logger)
  normalizeInfinity(opts, MINUS_ONE_EQUAL_INFINITY, DEFAULTS, logger)
  normalizeBytes(opts, BYTES_OPTS, DEFAULTS, logger)
  normalizeArrays(opts, ARRAY_OPTS, DEFAULTS, logger)
  normalizeDurationOptions(opts, DURATION_OPTS, DEFAULTS, logger)
  normalizeBools(opts, BOOL_OPTS, DEFAULTS, logger)
  normalizeIgnoreOptions(opts)
  normalizeElasticsearchCaptureBodyUrls(opts)
  normalizeDisableMetrics(opts)
  normalizeSanitizeFieldNames(opts)
  normalizeContextManager(opts, [], DEFAULTS, logger) // Must be after normalizeBools().
  normalizeCloudProvider(opts, [], DEFAULTS, logger)
  normalizeTransactionSampleRate(opts, [], DEFAULTS, logger)
  normalizeTraceContinuationStrategy(opts, [], DEFAULTS, logger)
  normalizeCustomMetricsHistogramBoundaries(opts, [], DEFAULTS, logger)

  // This must be after `normalizeDurationOptions()` and `normalizeBools()`
  // because it synthesizes the deprecated `spanFramesMinDuration` and
  // `captureSpanStackTraces` options into `spanStackTraceMinDuration`.
  normalizeSpanStackTraceMinDuration(opts, [], DEFAULTS, logger)

  truncateOptions(opts)
}

function truncateOptions (opts) {
  if (opts.serviceVersion) opts.serviceVersion = truncate(String(opts.serviceVersion), INTAKE_STRING_MAX_SIZE)
  if (opts.hostname) opts.hostname = truncate(String(opts.hostname), INTAKE_STRING_MAX_SIZE)
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

function loadConfigFile (configFile) {
  const confPath = path.resolve(configFile || process.env.ELASTIC_APM_CONFIG_FILE || 'elastic-apm-node.js')

  if (fs.existsSync(confPath)) {
    try {
      return require(confPath)
    } catch (err) {
      console.error('Elastic APM initialization error: Can\'t read config file %s', confPath)
      console.error(err.stack)
    }
  }

  return null
}

function loadServerCaCertFile (opts) {
  if (opts.serverCaCertFile) {
    try {
      return fs.readFileSync(opts.serverCaCertFile)
    } catch (err) {
      opts.logger.error('Elastic APM initialization error: Can\'t read server CA cert file %s (%s)', opts.serverCaCertFile, err.message)
    }
  }
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

function getBaseClientConfig (conf, agent) {
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
    serverCaCert: loadServerCaCertFile(conf),
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

// Exports.
module.exports = {
  configLogger,
  initialConfig,
  createConfig,
  userAgentFromConf
}
