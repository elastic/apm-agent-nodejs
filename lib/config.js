'use strict'

var fs = require('fs')
var path = require('path')

var consoleLogLevel = require('console-log-level')
var ElasticAPMHttpClient = require('elastic-apm-http-client')
var readPkgUp = require('read-pkg-up')
var truncate = require('unicode-byte-truncate')

var version = require('../package').version
var packageName = require('../package').name
// Standardize user-agent header. Only use "elasticapm-node" if it matches "elastic-apm-node".
if (packageName === 'elastic-apm-node') {
  packageName = 'elasticapm-node'
}
var userAgent = `${packageName}/${version}`

config.INTAKE_STRING_MAX_SIZE = 1024
config.CAPTURE_ERROR_LOG_STACK_TRACES_NEVER = 'never'
config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES = 'messages'
config.CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS = 'always'

module.exports = config

let confFile = loadConfigFile()

let serviceName, serviceVersion
try {
  const { name, version } = readPkgUp.sync().packageJson
  serviceName = name
  serviceVersion = version
} catch (err) {}

var DEFAULTS = {
  abortedErrorThreshold: '25s',
  active: true,
  addPatch: undefined,
  apiRequestSize: '768kb',
  apiRequestTime: '10s',
  asyncHooks: true,
  breakdownMetrics: true,
  captureBody: 'off',
  captureErrorLogStackTraces: config.CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  captureExceptions: true,
  captureHeaders: true,
  captureSpanStackTraces: true,
  centralConfig: true,
  containerId: undefined,
  disableInstrumentations: [],
  environment: process.env.NODE_ENV || 'development',
  errorMessageMaxLength: '2kb',
  errorOnAbortedRequests: false,
  filterHttpHeaders: true,
  globalLabels: undefined,
  instrument: true,
  instrumentIncomingHTTPRequests: true,
  kubernetesNamespace: undefined,
  kubernetesNodeName: undefined,
  kubernetesPodName: undefined,
  kubernetesPodUID: undefined,
  logLevel: 'info',
  logUncaughtExceptions: false, // TODO: Change to `true` in the v4.0.0
  metricsInterval: '30s',
  metricsLimit: 1000,
  serviceNodeName: undefined,
  serverTimeout: '30s',
  sourceLinesErrorAppFrames: 5,
  sourceLinesErrorLibraryFrames: 5,
  sourceLinesSpanAppFrames: 0,
  sourceLinesSpanLibraryFrames: 0,
  stackTraceLimit: 50,
  transactionMaxSpans: 500,
  transactionSampleRate: 1.0,
  usePathAsTransactionName: false,
  verifyServerCert: true
}

var ENV_TABLE = {
  abortedErrorThreshold: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
  active: 'ELASTIC_APM_ACTIVE',
  addPatch: 'ELASTIC_APM_ADD_PATCH',
  apiRequestSize: 'ELASTIC_APM_API_REQUEST_SIZE',
  apiRequestTime: 'ELASTIC_APM_API_REQUEST_TIME',
  asyncHooks: 'ELASTIC_APM_ASYNC_HOOKS',
  breakdownMetrics: 'ELASTIC_APM_BREAKDOWN_METRICS',
  captureBody: 'ELASTIC_APM_CAPTURE_BODY',
  captureErrorLogStackTraces: 'ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES',
  captureExceptions: 'ELASTIC_APM_CAPTURE_EXCEPTIONS',
  captureHeaders: 'ELASTIC_APM_CAPTURE_HEADERS',
  captureSpanStackTraces: 'ELASTIC_APM_CAPTURE_SPAN_STACK_TRACES',
  centralConfig: 'ELASTIC_APM_CENTRAL_CONFIG',
  containerId: 'ELASTIC_APM_CONTAINER_ID',
  disableInstrumentations: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
  environment: 'ELASTIC_APM_ENVIRONMENT',
  errorMessageMaxLength: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
  errorOnAbortedRequests: 'ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS',
  filterHttpHeaders: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
  frameworkName: 'ELASTIC_APM_FRAMEWORK_NAME',
  frameworkVersion: 'ELASTIC_APM_FRAMEWORK_VERSION',
  globalLabels: 'ELASTIC_APM_GLOBAL_LABELS',
  hostname: 'ELASTIC_APM_HOSTNAME',
  instrument: 'ELASTIC_APM_INSTRUMENT',
  instrumentIncomingHTTPRequests: 'ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS',
  kubernetesNamespace: ['ELASTIC_APM_KUBERNETES_NAMESPACE', 'KUBERNETES_NAMESPACE'],
  kubernetesNodeName: ['ELASTIC_APM_KUBERNETES_NODE_NAME', 'KUBERNETES_NODE_NAME'],
  kubernetesPodName: ['ELASTIC_APM_KUBERNETES_POD_NAME', 'KUBERNETES_POD_NAME'],
  kubernetesPodUID: ['ELASTIC_APM_KUBERNETES_POD_UID', 'KUBERNETES_POD_UID'],
  logLevel: 'ELASTIC_APM_LOG_LEVEL',
  logUncaughtExceptions: 'ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS',
  metricsInterval: 'ELASTIC_APM_METRICS_INTERVAL',
  metricsLimit: 'ELASTIC_APM_METRICS_LIMIT',
  payloadLogFile: 'ELASTIC_APM_PAYLOAD_LOG_FILE',
  secretToken: 'ELASTIC_APM_SECRET_TOKEN',
  serverTimeout: 'ELASTIC_APM_SERVER_TIMEOUT',
  serverUrl: 'ELASTIC_APM_SERVER_URL',
  serviceName: 'ELASTIC_APM_SERVICE_NAME',
  serviceNodeName: 'ELASTIC_APM_SERVICE_NODE_NAME',
  serviceVersion: 'ELASTIC_APM_SERVICE_VERSION',
  sourceLinesErrorAppFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES',
  sourceLinesErrorLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
  sourceLinesSpanAppFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
  sourceLinesSpanLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
  stackTraceLimit: 'ELASTIC_APM_STACK_TRACE_LIMIT',
  transactionMaxSpans: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
  transactionSampleRate: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
  usePathAsTransactionName: 'ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME',
  verifyServerCert: 'ELASTIC_APM_VERIFY_SERVER_CERT'
}

var CENTRAL_CONFIG = {
  transaction_sample_rate: 'transactionSampleRate'
}

var VALIDATORS = {
  transactionSampleRate: numberBetweenZeroAndOne
}

var BOOL_OPTS = [
  'active',
  'asyncHooks',
  'breakdownMetrics',
  'captureExceptions',
  'captureHeaders',
  'captureSpanStackTraces',
  'centralConfig',
  'errorOnAbortedRequests',
  'filterHttpHeaders',
  'instrument',
  'instrumentIncomingHTTPRequests',
  'logUncaughtExceptions',
  'usePathAsTransactionName',
  'verifyServerCert'
]

var NUM_OPTS = [
  'metricsLimit',
  'sourceLinesErrorAppFrames',
  'sourceLinesErrorLibraryFrames',
  'sourceLinesSpanAppFrames',
  'sourceLinesSpanLibraryFrames',
  'stackTraceLimit',
  'transactionMaxSpans',
  'transactionSampleRate'
]

var TIME_OPTS = [
  'abortedErrorThreshold',
  'apiRequestTime',
  'metricsInterval',
  'serverTimeout'
]

var BYTES_OPTS = [
  'apiRequestSize',
  'errorMessageMaxLength'
]

var MINUS_ONE_EQUAL_INFINITY = [
  'transactionMaxSpans'
]

var ARRAY_OPTS = [
  'disableInstrumentations'
]

var KEY_VALUE_OPTS = [
  'addPatch',
  'globalLabels'
]

function config (opts) {
  return new Config(opts)
}

class Config {
  constructor (opts) {
    this.ignoreUrlStr = []
    this.ignoreUrlRegExp = []
    this.ignoreUserAgentStr = []
    this.ignoreUserAgentRegExp = []

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
      readEnv() // options read from environment variables
    )

    // Custom logic for setting serviceName so that an empty string in the config
    // doesn't overwrite the serviceName read from package.json
    if (!this.serviceName) this.serviceName = serviceName
    if (!this.serviceVersion) this.serviceVersion = serviceVersion

    // NOTE: A logger will already exists if a custom logger was given to start()
    if (typeof this.logger === 'undefined') {
      this.logger = consoleLogLevel({
        level: this.logLevel
      })
    }

    normalize(this)

    if (typeof this.transport !== 'function') {
      this.transport = function httpTransport (conf, agent) {
        var transport = new ElasticAPMHttpClient({
          // metadata
          agentName: 'nodejs',
          agentVersion: version,
          serviceName: conf.serviceName,
          serviceNodeName: conf.serviceNodeName,
          serviceVersion: conf.serviceVersion,
          frameworkName: conf.frameworkName,
          frameworkVersion: conf.frameworkVersion,
          globalLabels: maybePairsToObject(conf.globalLabels),
          hostname: conf.hostname,
          environment: conf.environment,

          // Sanitize conf
          truncateKeywordsAt: config.INTAKE_STRING_MAX_SIZE,
          truncateErrorMessagesAt: conf.errorMessageMaxLength,

          // HTTP conf
          secretToken: conf.secretToken,
          userAgent: userAgent,
          serverUrl: conf.serverUrl,
          rejectUnauthorized: conf.verifyServerCert,
          serverTimeout: conf.serverTimeout * 1000,

          // APM Agent Configuration via Kibana:
          centralConfig: conf.centralConfig,

          // Streaming conf
          size: conf.apiRequestSize,
          time: conf.apiRequestTime * 1000,

          // Debugging
          payloadLogFile: conf.payloadLogFile,

          // Container conf
          containerId: conf.containerId,
          kubernetesNodeName: conf.kubernetesNodeName,
          kubernetesNamespace: conf.kubernetesNamespace,
          kubernetesPodName: conf.kubernetesPodName,
          kubernetesPodUID: conf.kubernetesPodUID
        })

        transport.on('config', remoteConf => {
          const conf = {}
          const unknown = []

          for (const [key, value] of Object.entries(remoteConf)) {
            const newKey = CENTRAL_CONFIG[key]
            if (newKey) {
              conf[newKey] = value
            } else {
              unknown.push(key)
            }
          }

          if (unknown.length > 0) {
            agent.logger.warn(`Remote config failure. Unsupported config names: ${unknown.join(', ')}`)
          }

          if (Object.keys(conf).length > 0) {
            normalize(conf, agent._conf)

            for (const [key, value] of Object.entries(conf)) {
              const validator = VALIDATORS[key]
              if (validator ? validator(value) : true) {
                agent.logger.info(`Remote config success. Updating ${key}: ${value}`)
                agent._conf[key] = value
              } else {
                agent.logger.warn(`Remote config failure. Invalid value for ${key}: ${value}`)
              }
            }
          }
        })

        transport.on('error', err => {
          agent.logger.error('APM Server transport error:', err.stack)
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

function normalize (opts) {
  normalizeIgnoreOptions(opts)
  normalizeKeyValuePairs(opts)
  normalizeNumbers(opts)
  normalizeBytes(opts)
  normalizeArrays(opts)
  normalizeTime(opts)
  normalizeBools(opts)
  truncateOptions(opts)
}

function normalizeIgnoreOptions (opts) {
  if (opts.ignoreUrls) {
    for (const ptn of opts.ignoreUrls) {
      if (typeof ptn === 'string') opts.ignoreUrlStr.push(ptn)
      else opts.ignoreUrlRegExp.push(ptn)
    }
    delete opts.ignoreUrls
  }

  if (opts.ignoreUserAgents) {
    for (const ptn of opts.ignoreUserAgents) {
      if (typeof ptn === 'string') opts.ignoreUserAgentStr.push(ptn)
      else opts.ignoreUserAgentRegExp.push(ptn)
    }
    delete opts.ignoreUserAgents
  }
}

function normalizeNumbers (opts) {
  for (const key of NUM_OPTS) {
    if (key in opts) opts[key] = Number(opts[key])
  }

  for (const key of MINUS_ONE_EQUAL_INFINITY) {
    if (opts[key] === -1) opts[key] = Infinity
  }
}

function normalizeBytes (opts) {
  for (const key of BYTES_OPTS) {
    if (key in opts) opts[key] = bytes(String(opts[key]))
  }
}

function normalizeTime (opts) {
  for (const key of TIME_OPTS) {
    if (key in opts) opts[key] = toSeconds(String(opts[key]))
  }
}

function maybeSplit (separator) {
  return (value) => {
    return typeof value === 'string' ? value.split(separator) : value
  }
}

const maybeSplitValues = maybeSplit(',')
const maybeSplitPairs = maybeSplit('=')

function normalizeArrays (opts) {
  for (const key of ARRAY_OPTS) {
    if (key in opts) opts[key] = maybeSplitValues(opts[key])
  }
}

function normalizeKeyValuePairs (opts) {
  for (const key of KEY_VALUE_OPTS) {
    if (key in opts) {
      if (typeof opts[key] === 'object' && !Array.isArray(opts[key])) {
        opts[key] = Object.entries(opts[key])
        return
      }

      if (!Array.isArray(opts[key])) {
        opts[key] = maybeSplitValues(opts[key])
      }

      if (Array.isArray(opts[key])) {
        opts[key] = opts[key].map(maybeSplitPairs)
      }
    }
  }
}

function normalizeBools (opts) {
  for (const key of BOOL_OPTS) {
    if (key in opts) opts[key] = strictBool(opts.logger, key, opts[key])
  }
}

function truncateOptions (opts) {
  if (opts.serviceVersion) opts.serviceVersion = truncate(String(opts.serviceVersion), config.INTAKE_STRING_MAX_SIZE)
  if (opts.hostname) opts.hostname = truncate(String(opts.hostname), config.INTAKE_STRING_MAX_SIZE)
}

function bytes (input) {
  const matches = input.match(/^(\d+)(b|kb|mb|gb)$/i)
  if (!matches) return Number(input)

  const suffix = matches[2].toLowerCase()
  let value = Number(matches[1])

  if (!suffix || suffix === 'b') {
    return value
  }

  value *= 1024
  if (suffix === 'kb') {
    return value
  }

  value *= 1024
  if (suffix === 'mb') {
    return value
  }

  value *= 1024
  if (suffix === 'gb') {
    return value
  }
}

function toSeconds (value) {
  var matches = /^(-)?(\d+)(m|ms|s)?$/.exec(value)
  if (!matches) return null

  var negate = matches[1]
  var amount = Number(matches[2])
  if (negate) amount = -amount
  var scale = matches[3]

  if (scale === 'm') {
    amount *= 60
  } else if (scale === 'ms') {
    amount /= 1000
  }

  return amount
}

function strictBool (logger, key, value) {
  if (typeof value === 'boolean') {
    return value
  }
  // This will return undefined for unknown inputs, resulting in them being skipped.
  switch (value) {
    case 'false': return false
    case 'true': return true
    default: {
      logger.warn('unrecognized boolean value "%s" for "%s"', value, key)
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

function numberBetweenZeroAndOne (n) {
  return n >= 0 && n <= 1
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
