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

// ---- support function
/**
 * Changes the keys from ELASTIC_APM_* the the proper config name
 * @param {Record<string, string>} envVars
 * @returns {Record<string, string>}
 */
function envToOptions(envVars) {
  return CONFIG_SCHEMA.reduce((acc, def) => {
    if (def.envVar && def.envVar in envVars) {
      acc[def.name] = envVars[def.envVar];
    }
    return acc;
  }, {});
}

/**
 * Returns only the lines with a given prefix `use-agent log:``
 * @param {string} stdout
 * @returns {string[]}
 */
function getUseAgentLogs(stdout) {
  const prefix = 'use-agent log:';
  return stdout
    .split('\n')
    .filter((l) => l.startsWith(prefix))
    .map((l) => l.replace(prefix, ''));
}

/**
 * Returns the logs emitted by the agent's logger filtered by level
 * @param {string} stdout
 * @param {string} level
 * @returns {Object[]}
 */
function getApmLogs(stdout, level) {
  return stdout
    .split('\n')
    .filter((l) => l.includes(`"log.level":"${level}"`))
    .map((l) => JSON.parse(l));
}

// ---- tests

/** @type {import('../_utils').TestFixture[]} */
const testFixtures = [
  {
    name: 'use agent - shoud have defaults',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true, // we want full control of the env
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = getUseAgentLogs(stdout);
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
    noConvenienceConfig: true,
    env: {
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
    },
    verbose: false,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = getUseAgentLogs(stdout);
      const envVars = JSON.parse(useAgentLogs[0]);
      const startConfig = JSON.parse(useAgentLogs[1]);
      const resolvedConfig = JSON.parse(useAgentLogs[2]);
      const expectedConfig = envToOptions(envVars);
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
    },
  },
  {
    name: 'use agent - shoud override start options by environment vars',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: (function () {
      const startOptsManual = {
        captureBody: 'on',
        captureErrorLogStackTraces: 'never',
        contextPropagationOnly: 'true',
        customMetricsHistogramBoundaries: [1, 2, 3, 4],
        disableInstrumentations: ['package-1', 'package-2'],
        environment: 'production',
        logLevel: 'warn',
        serverUrl: 'http://my.server.com:8200',
        serviceName: 'my-service-name',
        traceContinuationStrategy: 'restart',
      };

      const envVars = {}; // this will contain values
      const startOpts = {}; // this will try to override
      CONFIG_SCHEMA.forEach((def) => {
        const { name, envVar, defaultValue } = def;
        if (envVar && typeof defaultValue !== 'undefined') {
          envVars[envVar] = `${defaultValue}`;
          if (typeof defaultValue === 'boolean') {
            startOpts[name] = !defaultValue;
          } else if (typeof defaultValue === 'number') {
            startOpts[name] = defaultValue * 2;
          } else if (Array.isArray(defaultValue) && defaultValue.length === 0) {
            // Sepcial case for array envVars (disable* and igonre*)
            envVars[envVar] = 'one,two,three';
          }
        }
      });
      // Add the manual values
      Object.assign(startOpts, startOptsManual);
      envVars['TEST_APM_START_OPTIONS'] = JSON.stringify(startOpts);
      return envVars;
    })(),
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = getUseAgentLogs(stdout);
      const envVars = JSON.parse(useAgentLogs[0]);
      const resolvedConfig = JSON.parse(useAgentLogs[2]);
      const expectedConfig = envToOptions(envVars);
      const excludedKeys = new Set(
        [].concat(
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
    },
  },
  {
    name: 'use agent - should have priority of env, start, file',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_API_REQUEST_SIZE: '1024kb',
      TEST_APM_START_OPTIONS: JSON.stringify({
        apiRequestSize: '512kb',
        centralConfig: true,
        configFile: 'fixtures/use-agent-config.js',
      }),
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);

      const useAgentLogs = getUseAgentLogs(stdout);
      const fileConfig = require('./fixtures/use-agent-config.js');
      const resolvedConfig = JSON.parse(useAgentLogs[2]);

      t.equal(
        resolvedConfig.active,
        fileConfig.active,
        'options from file works',
      );
      t.equal(
        resolvedConfig.centralConfig,
        true,
        'file options is overwritten by start options',
      );
      t.equal(
        resolvedConfig.apiRequestSize,
        1024 * 1024,
        'file & start options is overwritten by env options',
      );
    },
  },
  {
    name: 'use agent - should parse values, log invalid ones and apply special cases',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_TRANSACTION_MAX_SPANS: '-1',
      ELASTIC_APM_BREAKDOWN_METRICS: 'false',
      ELASTIC_APM_API_REQUEST_SIZE: '1mb',
      ELASTIC_APM_ERROR_MESSAGE_MAX_LENGTH: '1mb',
      ELASTIC_APM_ACTIVE: 'nope',
      ELASTIC_APM_LOG_LEVEL: 'debug', // we want debug logs to check
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const reviver = (k, v) => (v === 'Infinity' ? Infinity : v);
      const useAgentLogs = getUseAgentLogs(stdout);
      const resolvedConfig = JSON.parse(useAgentLogs[2], reviver);
      const warnLogs = getApmLogs(stdout, 'warn');
      const debugLogs = getApmLogs(stdout, 'debug');

      t.equal(
        resolvedConfig.transactionMaxSpans,
        Infinity,
        'transactionMaxSpans can be set to Infinity (-1)',
      );
      t.equal(
        resolvedConfig.breakdownMetrics,
        false,
        '"false" value for breakdownMetrics is parsed',
      );
      t.equal(
        resolvedConfig.apiRequestSize,
        1024 * 1024,
        '"1mb" value is parsed for apiRequestSize',
      );
      t.equal(
        warnLogs[0].message,
        'config option "errorMessageMaxLength" is deprecated. Use "longFieldMaxLength"',
        'got a warning about deprecated value',
      );
      t.equal(
        resolvedConfig.errorMessageMaxLength,
        1024 * 1024,
        'bytes value is parsed for errorMessageMaxLength',
      );
      t.equal(
        warnLogs[1].message,
        'unrecognized boolean value "nope" for "active"',
        'got a warning about bogus boolean value',
      );
      t.equal(
        debugLogs[0].message,
        'Elastic APM agent disabled (`active` is false)',
        'got a debug log about agent disabled',
      );
      // XXX: normalization turns this value to `undefined` because "bogus"
      // is not a boolean. Do we want to keep it that way?
      t.equal(
        resolvedConfig.active,
        undefined,
        'bogus boolean does not get into config',
      );
    },
  },
  {
    name: 'use agent - should work for nor ELASTIC_APM_* prefixed vars',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      KUBERNETES_NODE_NAME: 'kube-node-name',
      KUBERNETES_NAMESPACE: 'kube-namespace',
      KUBERNETES_POD_NAME: 'kube-pod-name',
      KUBERNETES_POD_UID: 'kube-pod-id',
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const resolvedConfig = JSON.parse(useAgentLogs[2]);

      t.equal(
        resolvedConfig.kubernetesNodeName,
        'kube-node-name',
        'KUBERNETES_NODE_NAME maps to kubernetesNodeName',
      );
      t.equal(
        resolvedConfig.kubernetesNamespace,
        'kube-namespace',
        'KUBERNETES_NAMESPACE maps to kubernetesNamespace',
      );
      t.equal(
        resolvedConfig.kubernetesPodName,
        'kube-pod-name',
        'KUBERNETES_POD_NAME maps to kubernetesPodName',
      );
      t.equal(
        resolvedConfig.kubernetesPodUID,
        'kube-pod-id',
        'KUBERNETES_POD_UID maps to kubernetesPodUID',
      );
    },
  },
  {
    name: 'use agent - should support ket/value pairs formats',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_GLOBAL_LABELS: 'foo=bar,baz=buz', // string form
      TEST_APM_START_OPTIONS: JSON.stringify({
        addPatch: { foo: 'bar', baz: 'buz' },
      }), // object form
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const resolvedConfig = JSON.parse(useAgentLogs[2]);
      const pairs = [
        ['foo', 'bar'],
        ['baz', 'buz'],
      ];

      t.deepEqual(
        resolvedConfig.globalLabels,
        pairs,
        'globalLabels is parsed correctly from environment (string)',
      );
      t.deepEqual(
        resolvedConfig.addPatch,
        pairs,
        'addPatch is parsed correctly from start options (object)',
      );
    },
  },
];

test('agent config fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
