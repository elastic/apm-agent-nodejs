/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const { normalize } = require('../../lib/config/config');
const { CONFIG_SCHEMA, getDefaultOptions } = require('../../lib/config/schema');

const { runTestFixtures } = require('../_utils');

const defaultOptions = getDefaultOptions();
let envOverrides;

// ---- tests

/** @type {import('../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'use agent - shoud have defaults',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true, // we want full control of the env
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    verbose: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = stdout
        .split('\n')
        .filter((l) => l.startsWith('use-agent log:'))
        .map((l) => l.replace('use-agent log:', ''));
      const startConfig = JSON.parse(useAgentLogs[0]);
      const resolvedConfig = JSON.parse(useAgentLogs[1]);
      const defaultConfig = Object.assign({}, defaultOptions);
      const excludedKeys = new Set(
        [].concat(
          // start options
          Object.keys(startConfig),
          // calculated/redacted data
          ['serverUrl', 'serviceName', 'serviceVersion', 'loggingPreambleData'],
          // RegExp internal options (will be tested later)
          Object.keys(resolvedConfig).filter((k) => k.endsWith('RegExp')),
        ),
      );

      normalize(defaultConfig, console);

      Object.keys(resolvedConfig)
        .filter((k) => !excludedKeys.has(k))
        .forEach((key) => {
          const resolvedValue = resolvedConfig[key];
          const defaultValue = defaultConfig[key];

          t.deepEqual(
            resolvedValue,
            defaultValue,
            `${key} config is resolved to its default value`,
          );
        });
    },
  },
  {
    name: 'use agent - shoud be configurable by environment vars',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    timeout: 20000, // sanity guard on the test hanging
    maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
    noConvenienceConfig: true,
    env: (function () {
      const envVars = {
        ELASTIC_APM_ABORTED_ERROR_THRESHOLD: '30',
        ELASTIC_APM_ACTIVE: 'false',
        ELASTIC_APM_API_REQUEST_SIZE: '2048',
        ELASTIC_APM_API_REQUEST_TIME: '20',
        ELASTIC_APM_CAPTURE_BODY: 'on',
        ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES: 'never',
        ELASTIC_APM_CAPTURE_EXCEPTIONS: 'false',
        ELASTIC_APM_CENTRAL_CONFIG: 'false',
        ELASTIC_APM_CONTEXT_PROPAGATION_ONLY: 'true',
        ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES: '1,2,3,4',
        ELASTIC_APM_DISABLE_SEND: 'true',
        ELASTIC_APM_DISABLE_INSTRUMENTATIONS: 'package-1,package-2',
        ELASTIC_APM_ENVIRONMENT: 'production',
        ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH: '2048',
        ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS: 'true',
        ELASTIC_APM_INSTRUMENT: 'false',
        ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS: 'false',
        ELASTIC_APM_LOG_LEVEL: 'warn',
        ELASTIC_APM_LONG_FIELD_MAX_LENGTH: '20000',
        ELASTIC_APM_MAX_QUEUE_SIZE: '2048',
        ELASTIC_APM_METRICS_INTERVAL: '50',
        ELASTIC_APM_METRICS_LIMIT: '2000',
        ELASTIC_APM_SERVER_TIMEOUT: '60',
        ELASTIC_APM_SERVER_URL: 'http://my.server.com:8200',
        ELASTIC_APM_SERVICE_NAME: 'my-service-name',
        ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES: '10',
        ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES: '10',
        ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES: '5',
        ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES: '5',
        ELASTIC_APM_STACK_TRACE_LIMIT: '100',
        ELASTIC_APM_TRACE_CONTINUATION_STRATEGY: 'restart',
        ELASTIC_APM_TRANSACTION_MAX_SPANS: '250',
        ELASTIC_APM_TRANSACTION_SAMPLE_RATE: '0.5',
        ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME: 'true',
        ELASTIC_APM_VERIFY_SERVER_CERT: 'false',
      };

      envOverrides = {};
      CONFIG_SCHEMA.forEach((def) => {
        if (def.envVar && def.envVar in envVars) {
          envOverrides[def.name] = envVars[def.envVar];
        }
      });
      return envVars;
    })(),
    verbose: false,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = stdout
        .split('\n')
        .filter((l) => l.startsWith('use-agent log:'))
        .map((l) => l.replace('use-agent log:', ''));
      const startConfig = JSON.parse(useAgentLogs[0]);
      const resolvedConfig = JSON.parse(useAgentLogs[1]);
      const expectedConfig = Object.assign({}, envOverrides);
      const excludedKeys = new Set(
        [].concat(
          // start options
          Object.keys(startConfig),
          // calculated/redacted data
          ['serverUrl', 'serviceName', 'serviceVersion', 'loggingPreambleData'],
          // RegExp internal options (will be tested later)
          Object.keys(resolvedConfig).filter((k) => k.endsWith('RegExp')),
        ),
      );

      normalize(expectedConfig, console);

      Object.keys(expectedConfig)
        .filter((k) => !excludedKeys.has(k))
        .forEach((key) => {
          const resolvedValue = resolvedConfig[key];
          const expectedValue = expectedConfig[key];

          t.deepEqual(
            resolvedValue,
            expectedValue,
            `${key} config is resolved to its environment value`,
          );
        });

      envOverrides = undefined;
    },
  },
];

test('agent config fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
