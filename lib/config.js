'use strict'

var fs = require('fs')
var path = require('path')

var ElasticAPMHttpClient = require('elastic-apm-http-client')
var readPkgUp = require('read-pkg-up')
var truncate = require('unicode-byte-truncate')

var logging = require('./logging')
var version = require('../package').version
var packageName = require('../package').name

const { WildcardMatcher } = require('./wildcard-matcher')
const { CloudMetadata } = require('./cloud-metadata')

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
  cloudProvider: 'auto',
  containerId: undefined,
  disableInstrumentations: [],
  environment: process.env.NODE_ENV || 'development',
  errorMessageMaxLength: '2kb',
  errorOnAbortedRequests: false,
  filterHttpHeaders: true,
  globalLabels: undefined,
  ignoreMessageQueues: [],
  instrument: true,
  instrumentIncomingHTTPRequests: true,
  kubernetesNamespace: undefined,
  kubernetesNodeName: undefined,
  kubernetesPodName: undefined,
  kubernetesPodUID: undefined,
  logLevel: 'info',
  logUncaughtExceptions: false, // TODO: Change to `true` in the v4.0.0
  // Rough equivalent of the Java Agent's max_queue_size:
  // https://www.elastic.co/guide/en/apm/agent/java/current/config-reporter.html#config-max-queue-size
  maxQueueSize: 1024,
  metricsInterval: '30s',
  metricsLimit: 1000,
  sanitizeFieldNames: ['password', 'passwd', 'pwd', 'secret', '*key', '*token*',
    '*session*', '*credit*', '*card*', 'authorization', 'set-cookie',
    'pw', 'pass', 'connect.sid'
  ],
  serviceNodeName: undefined,
  serverTimeout: '30s',
  sourceLinesErrorAppFrames: 5,
  sourceLinesErrorLibraryFrames: 5,
  sourceLinesSpanAppFrames: 0,
  sourceLinesSpanLibraryFrames: 0,
  stackTraceLimit: 50,
  transactionIgnoreUrls: [],
  transactionMaxSpans: 500,
  transactionSampleRate: 1.0,
  useElasticTraceparentHeader: true,
  usePathAsTransactionName: false,
  verifyServerCert: true
}

var ENV_TABLE = {
  abortedErrorThreshold: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
  active: 'ELASTIC_APM_ACTIVE',
  addPatch: 'ELASTIC_APM_ADD_PATCH',
  apiKey: 'ELASTIC_APM_API_KEY',
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
  cloudProvider: 'ELASTIC_APM_CLOUD_PROVIDER',
  disableInstrumentations: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
  environment: 'ELASTIC_APM_ENVIRONMENT',
  ignoreMessageQueues: 'ELASTIC_IGNORE_MESSAGE_QUEUES',
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
  maxQueueSize: 'ELASTIC_APM_MAX_QUEUE_SIZE',
  metricsInterval: 'ELASTIC_APM_METRICS_INTERVAL',
  metricsLimit: 'ELASTIC_APM_METRICS_LIMIT',
  payloadLogFile: 'ELASTIC_APM_PAYLOAD_LOG_FILE',
  sanitizeFieldNames: 'ELASTIC_SANITIZE_FIELD_NAMES',
  serverCaCertFile: 'ELASTIC_APM_SERVER_CA_CERT_FILE',
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
  transactionIgnoreUrls: 'ELASTIC_APM_TRANSACTION_IGNORE_URLS',
  transactionMaxSpans: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
  transactionSampleRate: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
  useElasticTraceparentHeader: 'ELASTIC_APM_USE_ELASTIC_TRACEPARENT_HEADER',
  usePathAsTransactionName: 'ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME',
  verifyServerCert: 'ELASTIC_APM_VERIFY_SERVER_CERT'
}

var CENTRAL_CONFIG = {
  log_level: 'logLevel',
  transaction_sample_rate: 'transactionSampleRate',
  transaction_max_spans: 'transactionMaxSpans',
  capture_body: 'captureBody',
  transaction_ignore_urls: 'transactionIgnoreUrls',
  sanitize_field_names: 'sanitizeFieldNames',
  ignore_message_queues: 'ignoreMessageQueues'
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
  'maxQueueSize',
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
  'disableInstrumentations',
  'sanitizeFieldNames',
  'transactionIgnoreUrls',
  'ignoreMessageQueues'
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
    this.transactionIgnoreUrlRegExp = []
    this.sanitizeFieldNamesRegExp = []
    this.ignoreMessageQueuesRegExp = []
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

    // The logger is used in config process, so create it first.
    //
    // `ELASTIC_APM_LOGGER=false` is provided as a mechanism to *disable* a
    // custom logger for troubleshooting because a wrapped custom logger does
    // not get structured log data.
    // https://www.elastic.co/guide/en/apm/agent/nodejs/current/troubleshooting.html#debug-mode
    const customLogger = (process.env.ELASTIC_APM_LOGGER === 'false' ? null : this.logger)
    this.logger = logging.createLogger(this.logLevel, customLogger)

    normalize(this, this.logger)

    if (typeof this.transport !== 'function') {
      this.transport = function httpTransport (conf, agent) {
        let clientLogger = null
        if (!logging.isLoggerCustom(agent.logger)) {
          // https://www.elastic.co/guide/en/ecs/current/ecs-event.html#field-event-module
          clientLogger = agent.logger.child({ 'event.module': 'apmclient' })
        }
        var transport = new ElasticAPMHttpClient({
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
          apiKey: conf.apiKey,
          userAgent: userAgent,
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

          // Debugging
          logger: clientLogger,
          payloadLogFile: conf.payloadLogFile,

          // Container conf
          containerId: conf.containerId,
          kubernetesNodeName: conf.kubernetesNodeName,
          kubernetesNamespace: conf.kubernetesNamespace,
          kubernetesPodName: conf.kubernetesPodName,
          kubernetesPodUID: conf.kubernetesPodUID,

          // Cloud metadata fetching
          cloudMetadataFetcher: (new CloudMetadata(conf.cloudProvider, conf.logger))
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
            normalize(conf, agent.logger)

            for (const [key, value] of Object.entries(conf)) {
              const oldValue = agent._conf[key]
              agent._conf[key] = value
              if (key === 'logLevel' && value !== oldValue && !logging.isLoggerCustom(agent.logger)) {
                logging.setLogLevel(agent.logger, value)
                agent.logger.info(`Remote config success. Updated logger with new logLevel: ${value}`)
              }
              agent.logger.info(`Remote config success. Updated ${key}: ${value}`)
            }
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
    const loggable = {}
    for (const k in this) {
      if (!EXCLUDE_FIELDS[k] && this[k] !== undefined) {
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

function normalize (opts, logger) {
  normalizeKeyValuePairs(opts)
  normalizeNumbers(opts)
  normalizeBytes(opts)
  normalizeArrays(opts)
  normalizeTime(opts)
  normalizeBools(opts, logger)
  normalizeIgnoreOptions(opts)
  normalizeSanitizeFieldNames(opts)
  normalizeCloudProvider(opts, logger)
  normalizeTransactionSampleRate(opts, logger)
  truncateOptions(opts)
}

// transactionSampleRate is specified to be:
// - in the range [0,1]
// - rounded to 4 decimal places of precision (e.g. 0.0001, 0.5678, 0.9999)
// - with the special case that a value in the range (0, 0.0001] should be
//   rounded to 0.0001 -- to avoid a small value being rounded to zero.
//
// https://github.com/elastic/apm/blob/master/specs/agents/tracing-sampling.md
function normalizeTransactionSampleRate (opts, logger) {
  if ('transactionSampleRate' in opts) {
    // The value was already run through `Number(...)` in `normalizeNumbers`.
    const rate = opts.transactionSampleRate
    if (isNaN(rate) || rate < 0 || rate > 1) {
      opts.transactionSampleRate = DEFAULTS.transactionSampleRate
      logger.warn('Invalid "transactionSampleRate" config value %s, falling back to default %s',
        rate, opts.transactionSampleRate)
    } else if (rate > 0 && rate < 0.0001) {
      opts.transactionSampleRate = 0.0001
    } else {
      opts.transactionSampleRate = Math.round(rate * 10000) / 10000
    }
  }
}

function normalizeSanitizeFieldNames (opts) {
  if (opts.sanitizeFieldNames) {
    const wildcard = new WildcardMatcher()
    for (const ptn of opts.sanitizeFieldNames) {
      const re = wildcard.compile(ptn)
      opts.sanitizeFieldNamesRegExp.push(re)
    }
  }
}

function normalizeCloudProvider (opts, logger) {
  if ('cloudProvider' in opts) {
    const allowedValues = ['auto', 'gcp', 'azure', 'aws', 'none']
    if (allowedValues.indexOf(opts.cloudProvider) === -1) {
      logger.warn('Invalid "cloudProvider" config value %s, falling back to default %s',
        opts.cloudProvider, DEFAULTS.cloudProvider)
      opts.cloudProvider = DEFAULTS.cloudProvider
    }
  }
}

function normalizeIgnoreOptions (opts) {
  if (opts.transactionIgnoreUrls) {
    // We can't guarantee that opts will be a Config so set a
    // default value. This is to work around CENTRAL_CONFIG tests
    // that call this method with a plain object `{}`
    if (!opts.transactionIgnoreUrlRegExp) {
      opts.transactionIgnoreUrlRegExp = []
    }
    const wildcard = new WildcardMatcher()
    for (const ptn of opts.transactionIgnoreUrls) {
      const re = wildcard.compile(ptn)
      opts.transactionIgnoreUrlRegExp.push(re)
    }
  }

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

  if (opts.ignoreMessageQueues) {
    if (!opts.ignoreMessageQueuesRegExp) {
      opts.ignoreMessageQueuesRegExp = []
    }
    const wildcard = new WildcardMatcher()
    for (const ptn of opts.ignoreMessageQueues) {
      const re = wildcard.compile(ptn)
      opts.ignoreMessageQueuesRegExp.push(re)
    }
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

// Array config vars are either already an array of strings, or a
// comma-separated string (whitespace is trimmed):
//    'foo, bar' => ['foo', 'bar']
function normalizeArrays (opts) {
  for (const key of ARRAY_OPTS) {
    if (key in opts && typeof opts[key] === 'string') {
      opts[key] = opts[key].split(',').map(v => v.trim())
    }
  }
}

// KeyValuePairs config vars are either an object or a comma-separated string
// of key=value pairs (whitespace around the "key=value" strings is trimmed):
//    {'foo': 'bar', 'eggs': 'spam'} => [['foo', 'bar'], ['eggs', 'spam']]
//    foo=bar, eggs=spam             => [['foo', 'bar'], ['eggs', 'spam']]
function normalizeKeyValuePairs (opts) {
  for (const key of KEY_VALUE_OPTS) {
    if (key in opts) {
      if (typeof opts[key] === 'object' && !Array.isArray(opts[key])) {
        opts[key] = Object.entries(opts[key])
        return
      }

      if (!Array.isArray(opts[key]) && typeof opts[key] === 'string') {
        opts[key] = opts[key].split(',').map(v => v.trim())
      }

      if (Array.isArray(opts[key])) {
        // Note: Currently this assumes no '=' in the value. Also this does not
        // trim whitespace.
        opts[key] = opts[key].map(
          value => typeof value === 'string' ? value.split('=') : value)
      }
    }
  }
}

function normalizeBools (opts, logger) {
  for (const key of BOOL_OPTS) {
    if (key in opts) opts[key] = strictBool(logger, key, opts[key])
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
