/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const CONFIG_SCHEMA = [
  {
    name: 'abortedErrorThreshold',
    defaultValue: '25s',
    envVar: 'ELASTIC_APM_ABORTED_ERROR_THRESHOLD',
    types: [
      'duration({"defaultUnit":"s","allowedUnits":["ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'active',
    defaultValue: true,
    envVar: 'ELASTIC_APM_ACTIVE',
    types: ['boolean']
  },
  {
    name: 'addPatch',
    defaultValue: undefined,
    envVar: 'ELASTIC_APM_ADD_PATCH',
    types: ['keyValuePair']
  },
  {
    name: 'apiRequestSize',
    defaultValue: '768kb',
    envVar: 'ELASTIC_APM_API_REQUEST_SIZE',
    types: ['byte']
  },
  {
    name: 'apiRequestTime',
    defaultValue: '10s',
    envVar: 'ELASTIC_APM_API_REQUEST_TIME',
    types: [
      'duration({"defaultUnit":"s","allowedUnits":["ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'breakdownMetrics',
    defaultValue: true,
    envVar: 'ELASTIC_APM_BREAKDOWN_METRICS',
    types: ['boolean']
  },
  {
    name: 'captureBody',
    defaultValue: 'off',
    envVar: 'ELASTIC_APM_CAPTURE_BODY',
    centralConfig: 'capture_body'
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
    types: ['boolean']
  },
  {
    name: 'captureHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CAPTURE_HEADERS',
    types: ['boolean']
  },
  {
    name: 'centralConfig',
    defaultValue: true,
    envVar: 'ELASTIC_APM_CENTRAL_CONFIG',
    types: ['boolean']
  },
  {
    name: 'cloudProvider',
    defaultValue: 'auto',
    envVar: 'ELASTIC_APM_CLOUD_PROVIDER'
  },
  {
    name: 'containerId',
    defaultValue: undefined,
    envVar: 'ELASTIC_APM_CONTAINER_ID'
  },
  {
    name: 'contextPropagationOnly',
    defaultValue: false,
    envVar: 'ELASTIC_APM_CONTEXT_PROPAGATION_ONLY',
    types: ['boolean']
  },
  {
    name: 'customMetricsHistogramBoundaries',
    defaultValue: [
      0.00390625, 0.00552427, 0.0078125, 0.0110485,
      0.015625, 0.0220971, 0.03125, 0.0441942,
      0.0625, 0.0883883, 0.125, 0.176777,
      0.25, 0.353553, 0.5, 0.707107,
      1, 1.41421, 2, 2.82843,
      4, 5.65685, 8, 11.3137,
      16, 22.6274, 32, 45.2548,
      64, 90.5097, 128, 181.019,
      256, 362.039, 512, 724.077,
      1024, 1448.15, 2048, 2896.31,
      4096, 5792.62, 8192, 11585.2,
      16384, 23170.5, 32768, 46341,
      65536, 92681.9, 131072
    ],
    envVar: 'ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES'
  },
  {
    name: 'disableInstrumentations',
    defaultValue: [],
    envVar: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
    types: ['array']
  },
  {
    name: 'disableMetrics',
    defaultValue: [],
    envVar: 'ELASTIC_APM_DISABLE_METRICS',
    types: ['array']
  },
  {
    name: 'disableSend',
    defaultValue: false,
    envVar: 'ELASTIC_APM_DISABLE_SEND',
    types: ['boolean']
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
    types: ['array']
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
    types: ['boolean']
  },
  {
    name: 'exitSpanMinDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_EXIT_SPAN_MIN_DURATION',
    centralConfig: 'exit_span_min_duration',
    types: [
      'duration({"defaultUnit":"ms","allowedUnits":["us","ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'filterHttpHeaders',
    defaultValue: true,
    envVar: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
    types: ['boolean']
  },
  {
    name: 'globalLabels',
    defaultValue: undefined,
    envVar: 'ELASTIC_APM_GLOBAL_LABELS',
    types: ['keyValuePair']
  },
  {
    name: 'ignoreMessageQueues',
    defaultValue: [],
    envDeprecatedVar: 'ELASTIC_IGNORE_MESSAGE_QUEUES',
    envVar: 'ELASTIC_APM_IGNORE_MESSAGE_QUEUES',
    centralConfig: 'ignore_message_queues',
    types: ['array']
  },
  {
    name: 'instrument',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT',
    types: ['boolean']
  },
  {
    name: 'instrumentIncomingHTTPRequests',
    defaultValue: true,
    envVar: 'ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS',
    types: ['boolean']
  },
  {
    name: 'kubernetesNamespace',
    defaultValue: undefined,
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_NAMESPACE',
    envVar: 'KUBERNETES_NAMESPACE'
  },
  {
    name: 'kubernetesNodeName',
    defaultValue: undefined,
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_NODE_NAME',
    envVar: 'KUBERNETES_NODE_NAME'
  },
  {
    name: 'kubernetesPodName',
    defaultValue: undefined,
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_POD_NAME',
    envVar: 'KUBERNETES_POD_NAME'
  },
  {
    name: 'kubernetesPodUID',
    defaultValue: undefined,
    envDeprecatedVar: 'ELASTIC_APM_KUBERNETES_POD_UID',
    envVar: 'KUBERNETES_POD_UID'
  },
  {
    name: 'logLevel',
    defaultValue: 'info',
    envVar: 'ELASTIC_APM_LOG_LEVEL',
    centralConfig: 'log_level'
  },
  {
    name: 'logUncaughtExceptions',
    defaultValue: false,
    envVar: 'ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS',
    types: ['boolean']
  },
  {
    name: 'longFieldMaxLength',
    defaultValue: 10000,
    envVar: 'ELASTIC_APM_LONG_FIELD_MAX_LENGTH',
    types: ['number']
  },
  {
    name: 'maxQueueSize',
    defaultValue: 1024,
    envVar: 'ELASTIC_APM_MAX_QUEUE_SIZE',
    types: ['number']
  },
  {
    name: 'metricsInterval',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_METRICS_INTERVAL',
    types: [
      'duration({"defaultUnit":"s","allowedUnits":["ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'metricsLimit',
    defaultValue: 1000,
    envVar: 'ELASTIC_APM_METRICS_LIMIT',
    types: ['number']
  },
  {
    name: 'opentelemetryBridgeEnabled',
    defaultValue: false,
    envVar: 'ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED',
    types: ['boolean']
  },
  {
    name: 'sanitizeFieldNames',
    defaultValue: [
      'password', 'passwd',
      'pwd', 'secret',
      '*key', '*token*',
      '*session*', '*credit*',
      '*card*', '*auth*',
      'set-cookie', '*principal*',
      'pw', 'pass',
      'connect.sid'
    ],
    envDeprecatedVar: 'ELASTIC_SANITIZE_FIELD_NAMES',
    envVar: 'ELASTIC_APM_SANITIZE_FIELD_NAMES',
    centralConfig: 'sanitize_field_names',
    types: ['array']
  },
  {
    name: 'serviceNodeName',
    defaultValue: undefined,
    envVar: 'ELASTIC_APM_SERVICE_NODE_NAME'
  },
  {
    name: 'serverTimeout',
    defaultValue: '30s',
    envVar: 'ELASTIC_APM_SERVER_TIMEOUT',
    types: [
      'duration({"defaultUnit":"s","allowedUnits":["ms","s","m"],"allowNegative":false})'
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
    types: ['number']
  },
  {
    name: 'sourceLinesErrorLibraryFrames',
    defaultValue: 5,
    envVar: 'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
    types: ['number']
  },
  {
    name: 'sourceLinesSpanAppFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
    types: ['number']
  },
  {
    name: 'sourceLinesSpanLibraryFrames',
    defaultValue: 0,
    envVar: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
    types: ['number']
  },
  {
    name: 'spanCompressionEnabled',
    defaultValue: true,
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_ENABLED',
    types: ['boolean']
  },
  {
    name: 'spanCompressionExactMatchMaxDuration',
    defaultValue: '50ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_EXACT_MATCH_MAX_DURATION',
    types: [
      'duration({"defaultUnit":"ms","allowedUnits":["ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'spanCompressionSameKindMaxDuration',
    defaultValue: '0ms',
    envVar: 'ELASTIC_APM_SPAN_COMPRESSION_SAME_KIND_MAX_DURATION',
    types: [
      'duration({"defaultUnit":"ms","allowedUnits":["ms","s","m"],"allowNegative":false})'
    ]
  },
  {
    name: 'stackTraceLimit',
    defaultValue: 50,
    envVar: 'ELASTIC_APM_STACK_TRACE_LIMIT',
    types: ['number']
  },
  {
    name: 'traceContinuationStrategy',
    defaultValue: 'continue',
    envVar: 'ELASTIC_APM_TRACE_CONTINUATION_STRATEGY',
    centralConfig: 'trace_continuation_strategy'
  },
  {
    name: 'transactionIgnoreUrls',
    defaultValue: [],
    envVar: 'ELASTIC_APM_TRANSACTION_IGNORE_URLS',
    centralConfig: 'transaction_ignore_urls',
    types: ['array']
  },
  {
    name: 'transactionMaxSpans',
    defaultValue: 500,
    envVar: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
    centralConfig: 'transaction_max_spans',
    types: ['number', 'infinity']
  },
  {
    name: 'transactionSampleRate',
    defaultValue: 1,
    envVar: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
    centralConfig: 'transaction_sample_rate',
    types: ['number']
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
    types: ['boolean']
  },
  {
    name: 'verifyServerCert',
    defaultValue: true,
    envVar: 'ELASTIC_APM_VERIFY_SERVER_CERT',
    types: ['boolean']
  },
  { name: 'apiKey', envVar: 'ELASTIC_APM_API_KEY' },
  {
    name: 'asyncHooks',
    envVar: 'ELASTIC_APM_ASYNC_HOOKS',
    types: ['boolean']
  },
  {
    name: 'captureSpanStackTraces',
    envVar: 'ELASTIC_APM_CAPTURE_SPAN_STACK_TRACES',
    types: ['boolean']
  },
  { name: 'contextManager', envVar: 'ELASTIC_APM_CONTEXT_MANAGER' },
  {
    name: 'errorMessageMaxLength',
    envVar: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
    types: ['byte']
  },
  { name: 'frameworkName', envVar: 'ELASTIC_APM_FRAMEWORK_NAME' },
  { name: 'frameworkVersion', envVar: 'ELASTIC_APM_FRAMEWORK_VERSION' },
  { name: 'hostname', envVar: 'ELASTIC_APM_HOSTNAME' },
  { name: 'payloadLogFile', envVar: 'ELASTIC_APM_PAYLOAD_LOG_FILE' },
  {
    name: 'serverCaCertFile',
    envVar: 'ELASTIC_APM_SERVER_CA_CERT_FILE'
  },
  { name: 'secretToken', envVar: 'ELASTIC_APM_SECRET_TOKEN' },
  { name: 'serviceName', envVar: 'ELASTIC_APM_SERVICE_NAME' },
  { name: 'serviceVersion', envVar: 'ELASTIC_APM_SERVICE_VERSION' },
  {
    name: 'spanStackTraceMinDuration',
    envVar: 'ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION',
    centralConfig: 'span_stack_trace_min_duration',
    types: [
      'duration({"defaultUnit":"ms","allowedUnits":["ms","s","m"],"allowNegative":true})'
    ]
  },
  {
    name: 'spanFramesMinDuration',
    envVar: 'ELASTIC_APM_SPAN_FRAMES_MIN_DURATION',
    types: [
      'duration({"defaultUnit":"s","allowedUnits":["ms","s","m"],"allowNegative":true})'
    ]
  }
]

module.exports = {
  CONFIG_SCHEMA
}
