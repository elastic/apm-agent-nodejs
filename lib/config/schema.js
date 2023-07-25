/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const INTAKE_STRING_MAX_SIZE = 1024;
const CAPTURE_ERROR_LOG_STACK_TRACES_NEVER = 'never';
const CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES = 'messages';
const CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS = 'always';
const CONTEXT_MANAGER_PATCH = 'patch';
const CONTEXT_MANAGER_ASYNCHOOKS = 'asynchooks';
const CONTEXT_MANAGER_ASYNCLOCALSTORAGE = 'asynclocalstorage';
const TRACE_CONTINUATION_STRATEGY_CONTINUE = 'continue';
const TRACE_CONTINUATION_STRATEGY_RESTART = 'restart';
const TRACE_CONTINUATION_STRATEGY_RESTART_EXTERNAL = 'restart_external';

const DEFAULTS = {
  abortedErrorThreshold: '25s',
  active: true,
  addPatch: undefined,
  apiRequestSize: '768kb',
  apiRequestTime: '10s',
  breakdownMetrics: true,
  captureBody: 'off',
  captureErrorLogStackTraces: CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  captureExceptions: true,
  captureHeaders: true,
  centralConfig: true,
  cloudProvider: 'auto',
  containerId: undefined,
  // 'contextManager' and 'asyncHooks' are explicitly *not* included in DEFAULTS
  // because normalizeContextManager() needs to know if a value was provided by
  // the user.
  contextPropagationOnly: false,
  // Exponential powers-of-2 bucket boundaries, rounded to 6 significant figures.
  //    2**N for N in [-8, -7.5, -7, ..., 16, 16.5, 17]
  // https://github.com/elastic/apm/blob/main/specs/agents/metrics-otel.md#histogram-aggregation
  customMetricsHistogramBoundaries: [
    0.00390625, 0.00552427, 0.0078125, 0.0110485, 0.015625, 0.0220971, 0.03125,
    0.0441942, 0.0625, 0.0883883, 0.125, 0.176777, 0.25, 0.353553, 0.5,
    0.707107, 1, 1.41421, 2, 2.82843, 4, 5.65685, 8, 11.3137, 16, 22.6274, 32,
    45.2548, 64, 90.5097, 128, 181.019, 256, 362.039, 512, 724.077, 1024,
    1448.15, 2048, 2896.31, 4096, 5792.62, 8192, 11585.2, 16384, 23170.5, 32768,
    46341, 65536, 92681.9, 131072,
  ],
  disableInstrumentations: [],
  disableMetrics: [],
  disableSend: false,
  elasticsearchCaptureBodyUrls: [
    '*/_search',
    '*/_search/template',
    '*/_msearch',
    '*/_msearch/template',
    '*/_async_search',
    '*/_count',
    '*/_sql',
    '*/_eql/search',
  ],
  environment: process.env.NODE_ENV || 'development',
  errorOnAbortedRequests: false,
  exitSpanMinDuration: '0ms',
  // Deprecated: already filtered with `sanitizeFieldNames` defaults
  // TODO: https://github.com/elastic/apm-agent-nodejs/issues/3332
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
  longFieldMaxLength: 10000,
  // Rough equivalent of the Java Agent's max_queue_size:
  // https://www.elastic.co/guide/en/apm/agent/java/current/config-reporter.html#config-max-queue-size
  maxQueueSize: 1024,
  metricsInterval: '30s',
  metricsLimit: 1000,
  opentelemetryBridgeEnabled: false,
  sanitizeFieldNames: [
    // These patterns are specified in the shared APM specs:
    // https://github.com/elastic/apm/blob/main/specs/agents/sanitization.md
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
    // These are default patterns only in the Node.js APM agent, historically
    // from when the "is-secret" dependency was used.
    'pw',
    'pass',
    'connect.sid',
  ],
  serviceNodeName: undefined,
  serverTimeout: '30s',
  serverUrl: 'http://127.0.0.1:8200',
  sourceLinesErrorAppFrames: 5,
  sourceLinesErrorLibraryFrames: 5,
  sourceLinesSpanAppFrames: 0,
  sourceLinesSpanLibraryFrames: 0,
  spanCompressionEnabled: true,
  spanCompressionExactMatchMaxDuration: '50ms',
  spanCompressionSameKindMaxDuration: '0ms',
  // 'spanStackTraceMinDuration' is explicitly *not* included in DEFAULTS
  // because normalizeSpanStackTraceMinDuration() needs to know if a value
  // was provided by the user.
  stackTraceLimit: 50,
  traceContinuationStrategy: TRACE_CONTINUATION_STRATEGY_CONTINUE,
  transactionIgnoreUrls: [],
  transactionMaxSpans: 500,
  transactionSampleRate: 1.0,
  useElasticTraceparentHeader: true,
  usePathAsTransactionName: false,
  verifyServerCert: true,
};

const ENV_TABLE = {
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
  cloudProvider: 'ELASTIC_APM_CLOUD_PROVIDER',
  containerId: 'ELASTIC_APM_CONTAINER_ID',
  contextManager: 'ELASTIC_APM_CONTEXT_MANAGER',
  contextPropagationOnly: 'ELASTIC_APM_CONTEXT_PROPAGATION_ONLY',
  customMetricsHistogramBoundaries:
    'ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES',
  disableInstrumentations: 'ELASTIC_APM_DISABLE_INSTRUMENTATIONS',
  disableMetrics: 'ELASTIC_APM_DISABLE_METRICS',
  disableSend: 'ELASTIC_APM_DISABLE_SEND',
  environment: 'ELASTIC_APM_ENVIRONMENT',
  exitSpanMinDuration: 'ELASTIC_APM_EXIT_SPAN_MIN_DURATION',
  ignoreMessageQueues: [
    'ELASTIC_IGNORE_MESSAGE_QUEUES',
    'ELASTIC_APM_IGNORE_MESSAGE_QUEUES',
  ],
  elasticsearchCaptureBodyUrls: 'ELASTIC_APM_ELASTICSEARCH_CAPTURE_BODY_URLS',
  errorMessageMaxLength: 'ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH',
  errorOnAbortedRequests: 'ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS',
  // Deprecated: already filtered with `sanitizeFieldNames` defaults
  // TODO: https://github.com/elastic/apm-agent-nodejs/issues/3332
  filterHttpHeaders: 'ELASTIC_APM_FILTER_HTTP_HEADERS',
  frameworkName: 'ELASTIC_APM_FRAMEWORK_NAME',
  frameworkVersion: 'ELASTIC_APM_FRAMEWORK_VERSION',
  globalLabels: 'ELASTIC_APM_GLOBAL_LABELS',
  hostname: 'ELASTIC_APM_HOSTNAME',
  instrument: 'ELASTIC_APM_INSTRUMENT',
  instrumentIncomingHTTPRequests:
    'ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS',
  kubernetesNamespace: [
    'ELASTIC_APM_KUBERNETES_NAMESPACE',
    'KUBERNETES_NAMESPACE',
  ],
  kubernetesNodeName: [
    'ELASTIC_APM_KUBERNETES_NODE_NAME',
    'KUBERNETES_NODE_NAME',
  ],
  kubernetesPodName: ['ELASTIC_APM_KUBERNETES_POD_NAME', 'KUBERNETES_POD_NAME'],
  kubernetesPodUID: ['ELASTIC_APM_KUBERNETES_POD_UID', 'KUBERNETES_POD_UID'],
  logLevel: 'ELASTIC_APM_LOG_LEVEL',
  logUncaughtExceptions: 'ELASTIC_APM_LOG_UNCAUGHT_EXCEPTIONS',
  longFieldMaxLength: 'ELASTIC_APM_LONG_FIELD_MAX_LENGTH',
  maxQueueSize: 'ELASTIC_APM_MAX_QUEUE_SIZE',
  metricsInterval: 'ELASTIC_APM_METRICS_INTERVAL',
  metricsLimit: 'ELASTIC_APM_METRICS_LIMIT',
  opentelemetryBridgeEnabled: 'ELASTIC_APM_OPENTELEMETRY_BRIDGE_ENABLED',
  payloadLogFile: 'ELASTIC_APM_PAYLOAD_LOG_FILE',
  sanitizeFieldNames: [
    'ELASTIC_SANITIZE_FIELD_NAMES',
    'ELASTIC_APM_SANITIZE_FIELD_NAMES',
  ],
  serverCaCertFile: 'ELASTIC_APM_SERVER_CA_CERT_FILE',
  secretToken: 'ELASTIC_APM_SECRET_TOKEN',
  serverTimeout: 'ELASTIC_APM_SERVER_TIMEOUT',
  serverUrl: 'ELASTIC_APM_SERVER_URL',
  serviceName: 'ELASTIC_APM_SERVICE_NAME',
  serviceNodeName: 'ELASTIC_APM_SERVICE_NODE_NAME',
  serviceVersion: 'ELASTIC_APM_SERVICE_VERSION',
  sourceLinesErrorAppFrames: 'ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES',
  sourceLinesErrorLibraryFrames:
    'ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES',
  sourceLinesSpanAppFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES',
  sourceLinesSpanLibraryFrames: 'ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES',
  spanCompressionEnabled: 'ELASTIC_APM_SPAN_COMPRESSION_ENABLED',
  spanCompressionExactMatchMaxDuration:
    'ELASTIC_APM_SPAN_COMPRESSION_EXACT_MATCH_MAX_DURATION',
  spanCompressionSameKindMaxDuration:
    'ELASTIC_APM_SPAN_COMPRESSION_SAME_KIND_MAX_DURATION',
  spanStackTraceMinDuration: 'ELASTIC_APM_SPAN_STACK_TRACE_MIN_DURATION',
  spanFramesMinDuration: 'ELASTIC_APM_SPAN_FRAMES_MIN_DURATION',
  stackTraceLimit: 'ELASTIC_APM_STACK_TRACE_LIMIT',
  traceContinuationStrategy: 'ELASTIC_APM_TRACE_CONTINUATION_STRATEGY',
  transactionIgnoreUrls: 'ELASTIC_APM_TRANSACTION_IGNORE_URLS',
  transactionMaxSpans: 'ELASTIC_APM_TRANSACTION_MAX_SPANS',
  transactionSampleRate: 'ELASTIC_APM_TRANSACTION_SAMPLE_RATE',
  useElasticTraceparentHeader: 'ELASTIC_APM_USE_ELASTIC_TRACEPARENT_HEADER',
  usePathAsTransactionName: 'ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME',
  verifyServerCert: 'ELASTIC_APM_VERIFY_SERVER_CERT',
};

const CENTRAL_CONFIG_OPTS = {
  log_level: 'logLevel',
  transaction_sample_rate: 'transactionSampleRate',
  transaction_max_spans: 'transactionMaxSpans',
  capture_body: 'captureBody',
  transaction_ignore_urls: 'transactionIgnoreUrls',
  sanitize_field_names: 'sanitizeFieldNames',
  ignore_message_queues: 'ignoreMessageQueues',
  span_stack_trace_min_duration: 'spanStackTraceMinDuration',
  trace_continuation_strategy: 'traceContinuationStrategy',
  exit_span_min_duration: 'exitSpanMinDuration',
};

const CROSS_AGENT_CONFIG_VAR_NAME = {
  apiKey: 'api_key',
  serviceName: 'service_name',
  serviceVersion: 'service_version',
  secretToken: 'secret_token',
  serverUrl: 'server_url',
  logLevel: 'log_level',
  transactionSampleRate: 'transaction_sample_rate',
  transactionMaxSpans: 'transaction_max_spans',
  captureBody: 'capture_body',
  transactionIgnoreUrls: 'transaction_ignore_urls',
  sanitizeFieldNames: 'sanitize_field_names',
  ignoreMessageQueues: 'ignore_message_queues',
  spanStackTraceMinDuration: 'span_stack_trace_min_duration',
  traceContinuationStrategy: 'trace_continuation_strategy',
  exitSpanMinDuration: 'exit_span_min_duration',
  // TODO: check for more in https://docs.google.com/spreadsheets/d/1JJjZotapacA3FkHc2sv_0wiChILi3uKnkwLTjtBmxwU/edit#gid=0
};

const BOOL_OPTS = [
  'active',
  'asyncHooks',
  'breakdownMetrics',
  'captureExceptions',
  'captureHeaders',
  'captureSpanStackTraces',
  'centralConfig',
  'contextPropagationOnly',
  'disableSend',
  'errorOnAbortedRequests',
  'filterHttpHeaders',
  'instrument',
  'instrumentIncomingHTTPRequests',
  'logUncaughtExceptions',
  'opentelemetryBridgeEnabled',
  'spanCompressionEnabled',
  'usePathAsTransactionName',
  'verifyServerCert',
];

const NUM_OPTS = [
  'longFieldMaxLength',
  'maxQueueSize',
  'metricsLimit',
  'sourceLinesErrorAppFrames',
  'sourceLinesErrorLibraryFrames',
  'sourceLinesSpanAppFrames',
  'sourceLinesSpanLibraryFrames',
  'stackTraceLimit',
  'transactionMaxSpans',
  'transactionSampleRate',
];

const DURATION_OPTS = [
  {
    name: 'abortedErrorThreshold',
    defaultUnit: 's',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'apiRequestTime',
    defaultUnit: 's',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'exitSpanMinDuration',
    defaultUnit: 'ms',
    allowedUnits: ['us', 'ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'metricsInterval',
    defaultUnit: 's',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'serverTimeout',
    defaultUnit: 's',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'spanCompressionExactMatchMaxDuration',
    defaultUnit: 'ms',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    name: 'spanCompressionSameKindMaxDuration',
    defaultUnit: 'ms',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: false,
  },
  {
    // Deprecated: use `spanStackTraceMinDuration`.
    name: 'spanFramesMinDuration',
    defaultUnit: 's',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: true,
  },
  {
    name: 'spanStackTraceMinDuration',
    defaultUnit: 'ms',
    allowedUnits: ['ms', 's', 'm'],
    allowNegative: true,
  },
];

const BYTES_OPTS = ['apiRequestSize', 'errorMessageMaxLength'];

const MINUS_ONE_EQUAL_INFINITY = ['transactionMaxSpans'];

const ARRAY_OPTS = [
  'disableInstrumentations',
  'disableMetrics',
  'elasticsearchCaptureBodyUrls',
  'sanitizeFieldNames',
  'transactionIgnoreUrls',
  'ignoreMessageQueues',
];

const KEY_VALUE_OPTS = ['addPatch', 'globalLabels'];

const URL_OPTS = ['serverUrl'];

// Exports.
module.exports = {
  // Constant values
  INTAKE_STRING_MAX_SIZE,
  CAPTURE_ERROR_LOG_STACK_TRACES_NEVER,
  CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS,
  CONTEXT_MANAGER_PATCH,
  CONTEXT_MANAGER_ASYNCHOOKS,
  CONTEXT_MANAGER_ASYNCLOCALSTORAGE,
  TRACE_CONTINUATION_STRATEGY_CONTINUE,
  TRACE_CONTINUATION_STRATEGY_RESTART,
  TRACE_CONTINUATION_STRATEGY_RESTART_EXTERNAL,

  // Options
  CROSS_AGENT_CONFIG_VAR_NAME,
  CENTRAL_CONFIG_OPTS,
  BOOL_OPTS,
  NUM_OPTS,
  DURATION_OPTS,
  BYTES_OPTS,
  MINUS_ONE_EQUAL_INFINITY,
  ARRAY_OPTS,
  KEY_VALUE_OPTS,
  URL_OPTS,

  // The following are exported for tests.
  DEFAULTS,
  ENV_TABLE,
};
