/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const test = require('tape');

const {
  CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
} = require('../../lib/constants');
const { normalize } = require('../../lib/config/config');
const { getDefaultOptions } = require('../../lib/config/schema');
const apmName = require('../../package').name;

const { runTestFixtures } = require('../_utils');

const defaultOptions = getDefaultOptions();
let envOverrides;

// ---- tests

/** @type {import('../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'use agent with defaults',
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

      // fields with RegExps are stringified
      // defaultConfig.sanitizeFieldNamesRegExp.forEach((rexp, index, array) => {
      //   array[index] = rexp.toString();
      // });

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
  // {
  //   name: 'use agent with env vars',
  //   script: 'fixtures/use-agent.js',
  //   cwd: __dirname,
  //   timeout: 20000, // sanity guard on the test hanging
  //   maxBuffer: 10 * 1024 * 1024, // This is big, but I don't ever want this to be a failure reason.
  //   env: (function () {
  //     const envVars = {
  //       ELASTIC_APM_ABORTED_ERROR_THRESHOLD: { value: 25, prop: '' },
  //       ELASTIC_APM_ACTIVE: { value: true, prop: '' },
  //       ELASTIC_APM_API_REQUEST_SIZE: { value: 768 * 1024, prop: '' },
  //       ELASTIC_APM_API_REQUEST_TIME: { value: 10, prop: '' },
  //       ELASTIC_APM_CAPTURE_BODY: { value: 'off', prop: '' },
  //       ELASTIC_APM_CAPTURE_ERROR_LOG_STACK_TRACES: {
  //         value: CAPTURE_ERROR_LOG_STACK_TRACES_MESSAGES,
  //         prop: '',
  //       },
  //       ELASTIC_APM_CAPTURE_EXCEPTIONS: { value: true, prop: '' },
  //       ELASTIC_APM_CENTRAL_CONFIG: { value: true, prop: '' },
  //       ELASTIC_APM_CONTEXT_PROPAGATION_ONLY: { value: false, prop: '' },
  //       ELASTIC_APM_CUSTOM_METRICS_HISTOGRAM_BOUNDARIES: {
  //         value: defaultOptions.customMetricsHistogramBoundaries.slice(),
  //         prop: '',
  //       },
  //       ELASTIC_APM_DISABLE_SEND: { value: false, prop: '' },
  //       ELASTIC_APM_DISABLE_INSTRUMENTATIONS: { value: [], prop: '' },
  //       ELASTIC_APM_ENVIRONMENT: { value: 'development', prop: '' },
  //       ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH: { value: undefined, prop: '' },
  //       ELASTIC_APM_ERROR_ON_ABORTED_REQUESTS: { value: false, prop: '' },
  //       ELASTIC_APM_INSTRUMENT: { value: true, prop: '' },
  //       ELASTIC_APM_INSTRUMENT_INCOMING_HTTP_REQUESTS: {
  //         value: true,
  //         prop: '',
  //       },
  //       ELASTIC_APM_LOG_LEVEL: { value: 'info', prop: '' },
  //       ELASTIC_APM_LONG_FIELD_MAX_LENGTH: { value: 10000, prop: '' },
  //       ELASTIC_APM_MAX_QUEUE_SIZE: { value: 1024, prop: '' },
  //       ELASTIC_APM_METRICS_INTERVAL: { value: 30, prop: '' },
  //       ELASTIC_APM_METRICS_LIMIT: { value: 1000, prop: '' },
  //       ELASTIC_APM_SERVER_TIMEOUT: { value: 30, prop: '' },
  //       ELASTIC_APM_SERVER_URL: { value: 'http://127.0.0.1:8200', prop: '' },
  //       ELASTIC_APM_SERVICE_NAME: { value: apmName, prop: '' },
  //       ELASTIC_APM_SOURCE_LINES_ERROR_APP_FRAMES: { value: 5, prop: '' },
  //       ELASTIC_APM_SOURCE_LINES_ERROR_LIBRARY_FRAMES: { value: 5, prop: '' },
  //       ELASTIC_APM_SOURCE_LINES_SPAN_APP_FRAMES: { value: 0, prop: '' },
  //       ELASTIC_APM_SOURCE_LINES_SPAN_LIBRARY_FRAMES: { value: 0, prop: '' },
  //       ELASTIC_APM_STACK_TRACE_LIMIT: { value: 50, prop: '' },
  //       ELASTIC_APM_TRACE_CONTINUATION_STRATEGY: {
  //         value: 'continue',
  //         prop: '',
  //       },
  //       ELASTIC_APM_TRANSACTION_MAX_SPANS: { value: 500, prop: '' },
  //       ELASTIC_APM_TRANSACTION_SAMPLE_RATE: { value: 1.0, prop: '' },
  //       ELASTIC_APM_USE_PATH_AS_TRANSACTION_NAME: { value: false, prop: '' },
  //       ELASTIC_APM_VERIFY_SERVER_CERT: { value: true, prop: '' },
  //     };

  //     // const envVars = Object.keys(envSetup);
  //     const envSetup = {};
  //     envOverrides = {};

  //     Object.keys(envVars).forEach((name) => {
  //       const varSetup = envVars[name];
  //       envSetup[name] = varSetup.value;
  //       envOverrides[varSetup.prop] = varSetup.value;
  //     });
  //     return envSetup;
  //   })(),
  //   verbose: false,
  //   checkScriptResult: (t, err, stdout) => {
  //     t.error(err, `use-agent.js script succeeded: err=${err}`);

  //     const stdoutLines = stdout.split('\n');
  //     const startConfig = JSON.parse(stdoutLines[0]);
  //     const resolvedConfig = JSON.parse(stdoutLines[1]);
  //     const expectedConfig = Object.assign({}, defaultOptions);
  //     const excludedKeys = new Set(Object.keys(startConfig));

  //     // Some values tha are infered from context or redacted
  //     excludedKeys.add('serverUrl'); // redacted option

  //     normalize(expectedConfig, console);

  //     Object.keys(expectedConfig)
  //       .filter((k) => !excludedKeys.has(k))
  //       .forEach((key) => {
  //         const resolvedValue = resolvedConfig[key];
  //         const expectedValue = expectedConfig[key];

  //         t.deepEqual(
  //           resolvedValue,
  //           expectedValue,
  //           `${key} config is resolved to its environment value`,
  //         );
  //       });

  //     envOverrides = undefined;
  //   },
  // },
];

test('agent config fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
