/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const path = require('path');
var fs = require('fs');
var os = require('os');

const test = require('tape');

const { normalize } = require('../../lib/config/config');
const { CONFIG_SCHEMA, getDefaultOptions } = require('../../lib/config/schema');

const { runTestFixtures } = require('../_utils');
const { reviver, replacer } = require('./json-utils.js');

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
      envVars.TEST_APM_START_OPTIONS = JSON.stringify(startOpts);
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
      // TODO: normalization turns this value to `undefined` because "bogus"
      // is not a boolean. This is not what should happen according to the specs
      // so we need to change this behaviour
      // https://github.com/elastic/apm/blob/main/specs/agents/configuration.md#invalid-configuration-values
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
    name: 'use agent - NODE_ENV envvar sets "environment"',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      NODE_ENV: 'this-is-from-node-env',
      TEST_APM_START_OPTIONS: JSON.stringify({
        configFile: 'fixtures/use-agent-config.js',
      }),
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const resolvedConfig = JSON.parse(useAgentLogs[2]);
      t.equal(resolvedConfig.environment, 'this-is-from-node-env');
    },
  },
  {
    name: 'use agent - should support key/value pairs formats (string & object)',
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
  {
    name: 'use agent - should support key/value pairs formats (array)',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      TEST_APM_START_OPTIONS: JSON.stringify({
        globalLabels: [
          ['foo', 'bar'],
          ['baz', 'buz'],
        ],
      }),
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
        'globalLabels is parsed correctly from start options (array)',
      );
    },
  },
  {
    name: 'use agent - should support duration options',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_ABORTED_ERROR_THRESHOLD: '10s',
      ELASTIC_APM_API_REQUEST_TIME: '1m',
      ELASTIC_APM_EXIT_SPAN_MIN_DURATION: 'bogus',
      ELASTIC_APM_METRICS_INTERVAL: '500ms',
      TEST_APM_START_OPTIONS: JSON.stringify({
        serverTimeout: 30,
        spanCompressionExactMatchMaxDuration: '200',
        spanCompressionSameKindMaxDuration: '-100ms',
        spanStackTraceMinDuration: '-1s',
      }),
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const warnLogs = getApmLogs(stdout, 'warn');
      const resolvedConfig = JSON.parse(useAgentLogs[2]);

      t.equal(
        resolvedConfig.abortedErrorThreshold,
        10,
        'seconds are parsed correcly',
      );
      t.equal(
        resolvedConfig.apiRequestTime,
        60,
        'minutes are converted to seconds',
      );
      t.equal(
        resolvedConfig.metricsInterval,
        0.5,
        'miliseconds are converted to seconds',
      );
      t.equal(
        resolvedConfig.serverTimeout,
        30,
        'number value is accepted with default unit',
      );
      t.equal(
        resolvedConfig.exitSpanMinDuration,
        0,
        'bogus value is not accepted and used default instead',
      );
      t.equal(
        warnLogs[0].message,
        'invalid duration value "bogus" for "exitSpanMinDuration" config option: using default "0ms"',
        'agent warns about a bogus value in the configuration',
      );
      t.equal(
        resolvedConfig.spanCompressionExactMatchMaxDuration,
        0.2,
        'string value with no unit is accepted with default unit',
      );
      t.equal(
        warnLogs[1].message,
        'units missing in duration value "200" for "spanCompressionExactMatchMaxDuration" config option: using default units "ms"',
        'agent warns about a bogus value in the configuration',
      );

      t.equal(
        resolvedConfig.spanCompressionSameKindMaxDuration,
        0,
        'not allowed negative values fallback into the default value',
      );
      t.equal(
        warnLogs[2].message,
        'invalid duration value "-100ms" for "spanCompressionSameKindMaxDuration" config option: using default "0ms"',
        'agent warns about a bogus value in the configuration',
      );
      t.equal(
        resolvedConfig.spanStackTraceMinDuration,
        -1,
        'allowed negative are parsed correctly',
      );
    },
  },
  {
    name: 'use agent - should support string, regex & wildcards in ignore options',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_TRANSACTION_IGNORE_URLS: 'foo,bar,/wil*card',
      ELASTIC_APM_ELASTICSEARCH_CAPTURE_BODY_URLS: '*/_search,*/_eql/search',
      TEST_APM_START_OPTIONS: JSON.stringify(
        {
          ignoreUrls: ['str1', /regex1/],
          ignoreUserAgents: ['str2', /regex2/],
        },
        replacer,
      ),
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const resolvedConfig = JSON.parse(useAgentLogs[2], reviver);

      t.deepEqual(
        resolvedConfig.transactionIgnoreUrls,
        ['foo', 'bar', '/wil*card'],
        'transactionIgnoreUrls is parsed correctly from environment (wildcards)',
      );
      t.deepEqual(
        resolvedConfig.transactionIgnoreUrlRegExp,
        [/^foo$/i, /^bar$/i, /^\/wil.*card$/i],
        'transactionIgnoreUrlRegExp is parsed correctly from environment (wildcards)',
      );
      t.deepEqual(
        resolvedConfig.elasticsearchCaptureBodyUrls,
        ['*/_search', '*/_eql/search'],
        'elasticsearchCaptureBodyUrls is parsed correctly from environment (wildcards)',
      );
      t.deepEqual(
        resolvedConfig.elasticsearchCaptureBodyUrlsRegExp,
        [/^.*\/_search$/i, /^.*\/_eql\/search$/i],
        'elasticsearchCaptureBodyUrls is parsed correctly from environment (wildcards)',
      );
      t.deepEqual(
        resolvedConfig.ignoreUrlStr,
        ['str1'],
        'string items of ignoreUrls are added to the right config (ignoreUrlStr)',
      );
      t.deepEqual(
        resolvedConfig.ignoreUrlRegExp,
        [/regex1/],
        'regexp items of ignoreUrl are added to the right config (ignoreUrlRegExp)',
      );
      t.deepEqual(
        resolvedConfig.ignoreUserAgentStr,
        ['str2'],
        'string items of ignoreUserAgents are added to the right config (ignoreUserAgentStr)',
      );
      t.deepEqual(
        resolvedConfig.ignoreUserAgentRegExp,
        [/regex2/],
        'regexp items of ignoreUserAgents are added to the right config (ignoreUserAgentRegExp)',
      );
    },
  },
  {
    name: 'use agent - should not be active if the service name is invalid',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_SERVICE_NAME: 'foo&bar',
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const agentErrors = getApmLogs(stdout, 'error');
      const resolvedConfig = JSON.parse(useAgentLogs[2], reviver);

      t.equal(
        agentErrors[0].message,
        'serviceName "foo&bar" is invalid: contains invalid characters (allowed: a-z, A-Z, 0-9, _, -, <space>)',
        'agent shows an error about the bogs service name',
      );
      t.equal(
        agentErrors[1].message,
        'Elastic APM is incorrectly configured: Missing serviceName (APM will be disabled)',
        'agent shows an message telling it will be disabled',
      );
      t.equal(
        resolvedConfig.active,
        false,
        'active property of configuration is false',
      );
    },
  },
  {
    name: 'use agent - should be active if the service name valid',
    script: 'fixtures/use-agent.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    env: {
      ELASTIC_APM_SERVICE_NAME: 'fooBAR0123456789_- ',
    },
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `use-agent.js script succeeded: err=${err}`);
      const useAgentLogs = getUseAgentLogs(stdout);
      const agentErrors = getApmLogs(stdout, 'error');
      const resolvedConfig = JSON.parse(useAgentLogs[2], reviver);

      t.equal(agentErrors.length, 0, 'agent shows no errors');
      t.equal(
        resolvedConfig.active,
        true,
        'active property of configuration is true',
      );
    },
  },
  {
    name: 'pkg-zero-conf-valid - serviceName/serviceVersion inferred from package.json',
    script: 'fixtures/pkg-zero-conf-valid/index.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `pkg-zero-conf-valid/index.js script succeeded: err=${err}`);
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(lines[lines.length - 1]);
      t.equal(
        conf.serviceName,
        'validName',
        'serviceName was inferred from package.json',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  {
    name: 'pkg-zero-conf-valid - serviceName/serviceVersion inferred from package.json even if cwd is out the package tree',
    script: path.resolve(__dirname, 'fixtures/pkg-zero-conf-valid/index.js'),
    cwd: '/',
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `pkg-zero-conf-valid/index.js script succeeded: err=${err}`);
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(lines[lines.length - 1]);
      t.equal(
        conf.serviceName,
        'validName',
        'serviceName was inferred from package.json',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  {
    name: 'pkg-zero-conf-noname - serviceName/serviceVersion inferred from package.json even if there is no "name"',
    script: 'fixtures/pkg-zero-conf-noname/index.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(
        err,
        `pkg-zero-conf-noname/index.js script succeeded: err=${err}`,
      );
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(lines[lines.length - 1]);
      t.equal(
        conf.serviceName,
        'unknown-nodejs-service',
        'serviceName was inferred from package.json wihtout "name"',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  // A package.json#name that uses a scoped npm name, e.g. @ns/name, should get
  // a normalized serviceName='ns-name'.
  {
    name: 'pkg-zero-conf-nsname - serviceName/serviceVersion inferred from namespaced package',
    script: 'fixtures/pkg-zero-conf-nsname/index.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(
        err,
        `pkg-zero-conf-nsname/index.js script succeeded: err=${err}`,
      );
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(lines[lines.length - 1]);
      t.equal(
        conf.serviceName,
        'ns-name',
        'serviceName was inferred and normalized from package.json',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  {
    name: 'pkg-zero-conf-sanitize - serviceName/serviceVersion inferred package.json and sanitized',
    script: 'fixtures/pkg-zero-conf-sanitize/index.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(
        err,
        `pkg-zero-conf-sanitize/index.js script succeeded: err=${err}`,
      );
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(lines[lines.length - 1]);
      // serviceName sanitization changes any disallowed char to an underscore.
      // The pkg-zero-conf-sanitize/package.json has a name starting with the
      // 7 characters that an npm package name can have, but a serviceName
      // cannot.
      //    "name": "~*.!'()validNpmName"
      t.equal(
        conf.serviceName,
        '_______validNpmName',
        'serviceName was inferred and sanitized from package.json',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  {
    name: 'pkg-zero-conf-weird - serviceName/serviceVersion inferred package.json and weirdd',
    script: 'fixtures/pkg-zero-conf-weird/index.js',
    cwd: __dirname,
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(err, `pkg-zero-conf-weird/index.js script succeeded: err=${err}`);
      const lines = stdout.trim().split('\n');
      const logs = lines.map((l) => JSON.parse(l));
      const logWarn = logs.find((log) => log['log.level'] === 'warn');
      t.ok(
        logWarn['log.level'] === 'warn' &&
          logWarn.message.indexOf('serviceName') !== -1,
        'there is a log.warn about "serviceName"',
      );
      const conf = JSON.parse(
        // Filter out log lines from the APM agent itself. We just want the
        // `console.log(...)` from the index.js script.
        lines.filter((ln) => ln.indexOf('"log.level":') === -1)[0],
      );
      t.equal(
        conf.serviceName,
        'unknown-nodejs-service',
        'serviceName is the `unknown-{service.agent.name}-service` zero-conf fallback',
      );
      t.equal(
        conf.serviceVersion,
        '1.2.3',
        'serviceVersion was inferred from package.json',
      );
    },
  },
  {
    name: 'pkg-zero-conf-none - serviceName/serviceVersion resolved to unknown if no package.json present',
    script: (function () {
      const path = require('path');
      const fs = require('fs');
      const os = require('os');

      // To test the APM agent's fallback serviceName, we need to execute
      // a script in a dir that has no package.json in its dir, or any dir up
      // from it (we assume/hope that `os.tmpdir()` works for that).
      const script = path.resolve(
        os.tmpdir(),
        'elastic-apm-node-zero-conf-test-script.js',
      );
      // Avoid Windows '\' path separators that are interpreted as escapes when
      // interpolated into the script content below.
      const agentDir = path
        .resolve(__dirname, '..', '..')
        .replace(new RegExp('\\' + path.win32.sep, 'g'), path.posix.sep);

      fs.writeFileSync(
        script,
        `const apm = require('${agentDir}').start({
          disableSend: true
        })
        console.log(JSON.stringify(apm._conf))`,
      );
      return script;
    })(),
    cwd: os.tmpdir(),
    noConvenienceConfig: true,
    checkScriptResult: (t, err, stdout) => {
      t.error(
        err,
        `elastic-apm-node-zero-conf-test-script.js script succeeded: err=${err}`,
      );
      const lines = stdout.trim().split('\n');
      const conf = JSON.parse(
        // Filter out log lines from the APM agent itself. We just want the
        // `console.log(...)` from the index.js script.
        lines.filter((ln) => ln.indexOf('"log.level":') === -1)[0],
      );
      t.equal(
        conf.serviceName,
        'unknown-nodejs-service',
        'serviceName is the `unknown-{service.agent.name}-service` zero-conf fallback',
      );
      t.equal(conf.serviceVersion, undefined, 'serviceVersion is undefined');

      // remove the script
      fs.unlinkSync(
        path.resolve(os.tmpdir(), 'elastic-apm-node-zero-conf-test-script.js'),
      );
    },
  },
];

test('agent config fixtures', (suite) => {
  runTestFixtures(suite, testFixtures);
  suite.end();
});
