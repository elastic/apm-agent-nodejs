/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/**
 * Central location for shared constants
 */

module.exports = {
  // The default span or transaction `type`.
  DEFAULT_SPAN_TYPE: 'custom',

  REDACTED: '[REDACTED]',
  OUTCOME_FAILURE: 'failure',
  OUTCOME_SUCCESS: 'success',
  OUTCOME_UNKNOWN: 'unknown',
  RESULT_SUCCESS: 'success',
  RESULT_FAILURE: 'failure',

  // https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
  MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT: 1000,

  // Config constants
  INTAKE_STRING_MAX_SIZE: 1024,
  CAPTURE_ERROR_LOG_STACK_TRACES_NEVER: 'never',
  CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES: 'messages',
  CAPTURE_ERROR_LOG_STACK_TRACES_ALWAYS: 'always',
  CONTEXT_MANAGER_ASYNCHOOKS: 'asynchooks',
  CONTEXT_MANAGER_ASYNCLOCALSTORAGE: 'asynclocalstorage',
  TRACE_CONTINUATION_STRATEGY_CONTINUE: 'continue',
  TRACE_CONTINUATION_STRATEGY_RESTART: 'restart',
  TRACE_CONTINUATION_STRATEGY_RESTART_EXTERNAL: 'restart_external',
};
