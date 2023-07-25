/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const {
  normalizeBool,
  normalizeByte,
  normalizeNumber,
  normalizeInfinity,
  normalizeDuration,
  normalizeArray,
  normalizeKeyValuePair,
  normalizeSampleRate
} = require('./normalizers')

/**
 * @typedef {Object} OptionDefinition
 * @property {String} name the name of the configuration option
 * @property {String | undefined} envVar the name of the environment varaiable associated with the option
 * @property {String | undefined} envDeprecatedVar the name of the deprecated environment varaiable associated with the option
 * @property {any} defaultValue the default value of the property or undefined
 * @property {Array<Function>} normalizers the list of normalizers to appyl in order to get the final value of the option
 */

/**
 * @type Array<OptionDefinition>
 */
const CONFIG_SCHEMA = [
  {
    name: 'abortedErrorThreshold',
    defaultValue: '25s',
    envVar: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
    type: 'durationSeconds'
  },
  {
    name: 'active',
    defaultValue: true,
    envVar: 'ELASTIC_APM_ACTIVE',
    type: 'boolean'
  },
  {
    name: 'addPatch',
    envVar: 'ELASTIC_APM_ADD_PATCH',
    type: 'stringKeyValuePairs'
  },
  {
    name: 'apiRequestSize',
    defaultValue: '768kb',
    envVar: 'ELASTIC_APM_API_REQUEST_SIZE',
    type: 'byte'
  },
  {
    name: 'apiRequestTime',
    defaultValue: '10s',
    envVar: 'ELASTIC_APM_API_REQUEST_TIME',
    type: 'durationSeconds'
  },
  {
    name: 'breakdownMetrics',
    defaultValue: true,
    envVar: 'ELASTIC_APM_BREAKDOWN_METRICS',
    type: 'boolean'
  },
  {
    name: 'captureBody',
    defaultValue: 'off',
    envVar: 'ELASTIC_APM_CAPTURE_BODY',
    centralConfigName: 'capture_body'
  },
  {
    name: 'captureErrorLogStackTraces',
    defaultValue: 'messages',
    envVar: 'ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES'
  },
  {
    name: 'captureExceptions',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CAPTURE_EXCEPTIONS',
    type: 'boolean'
  },
  {
    name: 'captureHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CAPTURE_HEADERS',
    type: 'boolean'
  },
  {
    name: 'centralConfig',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CENTRAL_CONFIG',
    type: 'boolean'
  },
  {
    name: 'cloudProvider',
    defaultValue: 'auto',
    envVar: 'ELASTIC_APM_CLOUD_PROVIDER'
  },
  {
    name: 'containerId',
    envVar: 'ELASTIC_APM_CONTAINER_ID'
  },
  {
    name: 'contextPropagationOnly',
    defaultValue: false,
    envVar: 'ELASTIC_APM_CONTEXT_PROPAGATION_ONLY',
    type: 'boolean'
  },
  {
    name: 'customMetricsHistogramBoundaries',
    defaultValue: [
      0.00390625,
      0.00552427,
      0.0078125,
      0.0110485,
      0.015625,
      0.0220971,
      0.03125,
      0.0441942,
      0.0625,
      0.0883883,
      0.125,
      0.176777,
      0.25,
      0.353553,
      0.5,
      0.707107,
      1,
      1.41421,
      2,
      2.82843,
      4,
      5.65685,
      8,
      11.3137,
      16,
      22.6274,
      32,
      45.2548,
      64,
      90.5097,
      128,
      181.019,
      256,
      362.039,
      512,
      724.077,
      1024,
      1448.15,
      2048,
      2896.31,
      4096,
      5792.62,
      8192,
      11585.2,
      16384,
      23170.5,
      32768,
      46341,
      65536,
      92681.9,
      131072
    ],
    envVar: 'ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES'
  },
  {
    name: 'disableInstrumentations',
    defaultValue: [],
    envVar: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
    type: 'stringArray'
  },
  {
    name: 'disableMetrics',
    defaultValue: [],
    envVar: 'ELASTIC_APM_DISABLE_METRICS',
    type: 'wildcardArray'
  },
  {
    name: 'disableSend',
    defaultValue: false,
    envVar: 'ELASTIC_APM_DISABLE_SEND',
    type: 'boolean'
  },
  {
    name: 'elasticsearchCaptureBodyUrls',
    defaultValue: [
      '*/_search',
      '*/_search/template',
      '*/_msearch',
      '*/_msearch/template',
      '*/_async_search',
      '*/_count',
      '*/_sql',
      '*/_eql/search'
    ],
    envVar: 'ELASTIC_APM_ELASTICSEARCH_CAPTURE_BODY_URLS',
    type: 'wildcardArray'
  },
  {
    name: 'environment',
    defaultValue: 'development',
    envVar: 'ELASTIC_APM_ENVIRONMENT'
  },
  {
    name: 'errorOnAbortedRequests',
    defaultValue: false,
    envVar: 'ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS',
    type: 'boolean'
  },
  {
    name: 'exitSpanMinDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_EXIT_SPAN_MIN_DURATION',
    centralConfigName: 'exit_span_min_duration',
    type: 'durationMiliseconds'
  },
  {
    name: 'filterHttpHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
    type: 'boolean',
    deprecated: true
  },
  {
    name: 'globalLabels',
    envVar: 'ELASTIC_APM_GLOBAL_LABELS',
    type: 'stringKeyValuePairs'
  },
  {
    name: 'ignoreMessageQueues',
    defaultValue: [],
    envVar: 'ELASTIC_APM_IGNORE_MESSAGE_QUEUES',
    envDeprecatedVar: 'ELASTIC_IGNORE_MESSAGE_QUEUES',
    centralConfigName: 'ignore_message_queues',
    type: 'wildcardArray'
  },
  {
    name: 'instrument',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT',
    type: 'boolean'
  },
  {
    name: 'instrumentIncomingHTTPRequests',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS',
    type: 'boolean'
  },
  {
    name: 'kubernetesNamespace',
    envVar: 'KUBERNETES_NAMESPACE',
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_NAMESPACE'
  },
  {
    name: 'kubernetesNodeName',
    envVar: 'KUBERNETES_NODE_NAME',
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_NODE_NAME'
  },
  {
    name: 'kubernetesPodName',
    envVar: 'KUBERNETES_POD_NAME',
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_POD_NAME'
  },
  {
    name: 'kubernetesPodUID',
    envVar: 'KUBERNETES_POD_UID',
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_POD_UID'
  },
  {
    name: 'logLevel',
    defaultValue: 'info',
    envVar: 'ELASTIC_APM_LOG_LEVEL',
    centralConfigName: 'log_level'
  },
  {
    name: 'logUncaughtExceptions',
    defaultValue: false,
    envVar: 'ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS',
    type: 'boolean'
  },
  {
    name: 'longFieldMaxLength',
    defaultValue: 10000,
    envVar: 'ELASTIC_APM_LONG_FIELD_MAX_LENGTH',
    type: 'number'
  },
  {
    name: 'maxQueueSize',
    defaultValue: 1024,
    envVar: 'ELASTIC_APM_MAX_QUEUE_SIZE',
    type: 'number'
  },
  {
    name: 'metricsInterval',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_METRICS_INTERVAL',
    type: 'durationSeconds'
  },
  {
    name: 'metricsLimit',
    defaultValue: 1000,
    envVar: 'ELASTIC_APM_METRICS_LIMIT',
    type: 'number'
  },
  {
    name: 'opentelemetryBridgeEnabled',
    defaultValue: false,
    envVar: 'ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED',
    type: 'boolean'
  },
  {
    name: 'sanitizeFieldNames',
    defaultValue: [
      'password',
      'passwd',
      'pwd',
      'secret',
      '*key',
      '*token*',
      '*session*',
      '*credit*',
      '*card*',
      '*auth*',
      'set-cookie',
      '*principal*',
      'pw',
      'pass',
      'connect.sid'
    ],
    envVar: 'ELASTIC_APM_SANITIZE_FIELD_NAMES',
    envDeprecatedVar: 'ELASTIC_SANITIZE_FIELD_NAMES',
    centralConfigName: 'sanitize_field_names',
    type: 'wildcardArray'
  },
  {
    name: 'serviceNodeName',
    envVar: 'ELASTIC_APM_SERVICE_NODE_NAME'
  },
  {
    name: 'serverTimeout',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_SERVER_TIMEOUT',
    type: 'durationSeconds'
  },
  {
    name: 'serverUrl',
    defaultValue: 'http://127.0.0.1:8200',
    envVar: 'ELASTIC_APM_SERVER_URL'
  },
  {
    name: 'sourceLinesErrorAppFrames',
    defaultValue: 5,
    envVar: 'ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES',
    type: 'number'
  },
  {
    name: 'sourceLinesErrorLibraryFrames',
    defaultValue: 5,
    envVar: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
    type: 'number'
  },
  {
    name: 'sourceLinesSpanAppFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
    type: 'number'
  },
  {
    name: 'sourceLinesSpanLibraryFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
    type: 'number'
  },
  {
    name: 'spanCompressionEnabled',
    defaultValue: true,
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_ENABLED',
    type: 'boolean'
  },
  {
    name: 'spanCompressionExactMatchMaxDuration',
    defaultValue: '50ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_EXACT_MATCH_MAX_DURATION',
    type: 'durationCompression'
  },
  {
    name: 'spanCompressionSameKindMaxDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_SAME_KIND_MAX_DURATION',
    type: 'durationCompression'
  },
  {
    name: 'stackTraceLimit',
    defaultValue: 50,
    envVar: 'ELASTIC_APM_STACK_TRACE_LIMIT',
    type: 'number'
  },
  {
    name: 'traceContinuationStrategy',
    defaultValue: 'continue',
    envVar: 'ELASTIC_APM_TRACE_CONTINUATION_STRATEGY',
    centralConfigName: 'trace_continuation_strategy'
  },
  {
    name: 'transactionIgnoreUrls',
    defaultValue: [],
    envVar: 'ELASTIC_APM_TRANSACTION_IGNORE_URLS',
    centralConfigName: 'transaction_ignore_urls',
    type: 'wildcardArray'
  },
  {
    name: 'transactionMaxSpans',
    defaultValue: 500,
    envVar: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
    centralConfigName: 'transaction_max_spans',
    type: 'numberInfinity'
  },
  {
    name: 'transactionSampleRate',
    defaultValue: 1,
    envVar: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
    centralConfigName: 'transaction_sample_rate',
    type: 'sampleRate'
  },
  {
    name: 'useElasticTraceparentHeader',
    defaultValue: true,
    envVar: 'ELASTIC_APM_USE_ELASTIC_TRACEPARENT_HEADER'
  },
  {
    name: 'usePathAsTransactionName',
    defaultValue: false,
    envVar: 'ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME',
    type: 'boolean'
  },
  {
    name: 'verifyServerCert',
    defaultValue: true,
    envVar: 'ELASTIC_APM_VERIFY_SERVER_CERT',
    type: 'boolean'
  },
  {
    name: 'errorMessageMaxLength',
    envVar: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
    type: 'byte'
  },
  {
    name: 'spanStackTraceMinDuration',
    envVar: 'ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION',
    centralConfigName: 'span_stack_trace_min_duration',
    type: 'durationMilisecondsNegative'
  },
  {
    name: 'apiKey',
    envVar: 'ELASTIC_APM_API_KEY'
  },
  {
    name: 'asyncHooks',
    envVar: 'ELASTIC_APM_ASYNC_HOOKS',
    type: 'boolean'
  },
  {
    name: 'captureSpanStackTraces',
    envVar: 'ELASTIC_APM_CAPTURE_SPAN_STACK_TRACES',
    type: 'boolean'
  },
  {
    name: 'contextManager',
    envVar: 'ELASTIC_APM_CONTEXT_MANAGER'
  },
  {
    name: 'frameworkName',
    envVar: 'ELASTIC_APM_FRAMEWORK_NAME'
  },
  {
    name: 'frameworkVersion',
    envVar: 'ELASTIC_APM_FRAMEWORK_VERSION'
  },
  {
    name: 'hostname',
    envVar: 'ELASTIC_APM_HOSTNAME'
  },
  {
    name: 'payloadLogFile',
    envVar: 'ELASTIC_APM_PAYLOAD_LOG_FILE'
  },
  {
    name: 'serverCaCertFile',
    envVar: 'ELASTIC_APM_SERVER_CA_CERT_FILE'
  },
  {
    name: 'secretToken',
    envVar: 'ELASTIC_APM_SECRET_TOKEN'
  },
  {
    name: 'serviceName',
    envVar: 'ELASTIC_APM_SERVICE_NAME'
  },
  {
    name: 'serviceVersion',
    envVar: 'ELASTIC_APM_SERVICE_VERSION'
  },
  {
    name: 'spanFramesMinDuration',
    envVar: 'ELASTIC_APM_SPAN_FRAMES_MIN_DURATION',
    type: 'durationMinSeconds'
  }
]

const NORMALIZERS_BY_TYPE = {
  boolean: [normalizeBool],
  number: [normalizeNumber],
  numberInfinity: [normalizeNumber,normalizeInfinity],
  byte: [normalizeByte],
  stringArray: [normalizeArray],
  wilcardArray: [],
  stringKeyValuePairs: [normalizeKeyValuePair],
  sampleRate: [normalizeSampleRate],
  durationSeconds: [],
  durationMiliseconds: [],
  durationMinSeconds: [],
  durationMinMiliseconds: []
}

// Exports
module.exports = {
  CONFIG_SCHEMA,
  NORMALIZERS_BY_TYPE
}

