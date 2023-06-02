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
  // TODO: update path
} = require('../../../lib/config/normalizers')

const CONFIG_SCHEMA = [
  {
    name: 'abortedErrorThreshold',
    defaultValue: '25s',
    envVar: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
    normalizers: [
      normalizeDuration('s', ['ms', 's', 'm'], false)
    ]
  },
  {
    name: 'active',
    defaultValue: true,
    envVar: 'ELASTIC_APM_ACTIVE',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'addPatch',
    envVar: 'ELASTIC_APM_ADD_PATCH',
    normalizers: [
      normalizeKeyValuePair
    ]
  },
  {
    name: 'apiRequestSize',
    defaultValue: '768kb',
    envVar: 'ELASTIC_APM_API_REQUEST_SIZE',
    normalizers: [
      normalizeByte
    ]
  },
  {
    name: 'apiRequestTime',
    defaultValue: '10s',
    envVar: 'ELASTIC_APM_API_REQUEST_TIME',
    normalizers: [
      normalizeDuration('s', ['ms', 's', 'm'], false)
    ]
  },
  {
    name: 'breakdownMetrics',
    defaultValue: true,
    envVar: 'ELASTIC_APM_BREAKDOWN_METRICS',
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'captureHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CAPTURE_HEADERS',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'centralConfig',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CENTRAL_CONFIG',
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeArray
    ]
  },
  {
    name: 'disableMetrics',
    defaultValue: [],
    envVar: 'ELASTIC_APM_DISABLE_METRICS',
    normalizers: [
      normalizeArray
    ]
  },
  {
    name: 'disableSend',
    defaultValue: false,
    envVar: 'ELASTIC_APM_DISABLE_SEND',
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeArray
    ]
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
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'exitSpanMinDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_EXIT_SPAN_MIN_DURATION',
    centralConfigName: 'exit_span_min_duration',
    normalizers: [
      normalizeDuration('ms', ['us', 'ms', 's', 'm'], false)
    ]
  },
  {
    name: 'filterHttpHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
    normalizers: [
      normalizeBool
    ],
    deprecated: true
  },
  {
    name: 'globalLabels',
    envVar: 'ELASTIC_APM_GLOBAL_LABELS',
    normalizers: [
      normalizeKeyValuePair
    ]
  },
  {
    name: 'ignoreMessageQueues',
    defaultValue: [],
    envVar: 'ELASTIC_APM_IGNORE_MESSAGE_QUEUES',
    envDeprecatedVar: 'ELASTIC_IGNORE_MESSAGE_QUEUES',
    centralConfigName: 'ignore_message_queues',
    normalizers: [
      normalizeArray
    ]
  },
  {
    name: 'instrument',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'instrumentIncomingHTTPRequests',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS',
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'longFieldMaxLength',
    defaultValue: 10000,
    envVar: 'ELASTIC_APM_LONG_FIELD_MAX_LENGTH',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'maxQueueSize',
    defaultValue: 1024,
    envVar: 'ELASTIC_APM_MAX_QUEUE_SIZE',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'metricsInterval',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_METRICS_INTERVAL',
    normalizers: [
      normalizeDuration('s', ['ms', 's', 'm'], false)
    ]
  },
  {
    name: 'metricsLimit',
    defaultValue: 1000,
    envVar: 'ELASTIC_APM_METRICS_LIMIT',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'opentelemetryBridgeEnabled',
    defaultValue: false,
    envVar: 'ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED',
    normalizers: [
      normalizeBool
    ]
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
    normalizers: [
      normalizeArray
    ]
  },
  {
    name: 'serviceNodeName',
    envVar: 'ELASTIC_APM_SERVICE_NODE_NAME'
  },
  {
    name: 'serverTimeout',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_SERVER_TIMEOUT',
    normalizers: [
      normalizeDuration('s', ['ms', 's', 'm'], false)
    ]
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
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'sourceLinesErrorLibraryFrames',
    defaultValue: 5,
    envVar: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'sourceLinesSpanAppFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'sourceLinesSpanLibraryFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
    normalizers: [
      normalizeNumber
    ]
  },
  {
    name: 'spanCompressionEnabled',
    defaultValue: true,
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_ENABLED',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'spanCompressionExactMatchMaxDuration',
    defaultValue: '50ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_EXACT_MATCH_MAX_DURATION',
    normalizers: [
      normalizeDuration('ms', ['ms', 's', 'm'], false)
    ]
  },
  {
    name: 'spanCompressionSameKindMaxDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_SAME_KIND_MAX_DURATION',
    normalizers: [
      normalizeDuration('ms', ['ms', 's', 'm'], false)
    ]
  },
  {
    name: 'stackTraceLimit',
    defaultValue: 50,
    envVar: 'ELASTIC_APM_STACK_TRACE_LIMIT',
    normalizers: [
      normalizeNumber
    ]
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
    normalizers: [
      normalizeArray
    ]
  },
  {
    name: 'transactionMaxSpans',
    defaultValue: 500,
    envVar: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
    centralConfigName: 'transaction_max_spans',
    normalizers: [
      normalizeNumber,
      normalizeInfinity
    ]
  },
  {
    name: 'transactionSampleRate',
    defaultValue: 1,
    envVar: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
    centralConfigName: 'transaction_sample_rate',
    normalizers: [
      normalizeNumber,
      normalizeSampleRate
    ]
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
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'verifyServerCert',
    defaultValue: true,
    envVar: 'ELASTIC_APM_VERIFY_SERVER_CERT',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'apiKey',
    envVar: 'ELASTIC_APM_API_KEY'
  },
  {
    name: 'asyncHooks',
    envVar: 'ELASTIC_APM_ASYNC_HOOKS',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'captureSpanStackTraces',
    envVar: 'ELASTIC_APM_CAPTURE_SPAN_STACK_TRACES',
    normalizers: [
      normalizeBool
    ]
  },
  {
    name: 'contextManager',
    envVar: 'ELASTIC_APM_CONTEXT_MANAGER'
  },
  {
    name: 'errorMessageMaxLength',
    envVar: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
    normalizers: [
      normalizeByte
    ]
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
    name: 'spanStackTraceMinDuration',
    envVar: 'ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION',
    centralConfigName: 'span_stack_trace_min_duration',
    normalizers: [
      normalizeDuration('ms', ['ms', 's', 'm'], true)
    ]
  },
  {
    name: 'spanFramesMinDuration',
    envVar: 'ELASTIC_APM_SPAN_FRAMES_MIN_DURATION',
    normalizers: [
      normalizeDuration('s', ['ms', 's', 'm'], true)
    ]
  }
]

// Exports
module.exports = {
  CONFIG_SCHEMA
}


