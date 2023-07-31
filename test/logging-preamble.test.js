/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
const test = require('tape');

const AGENT_VERSION = require('../package.json').version;

const Agent = require('../lib/agent');
const { createMockLogger } = require('./_mock_logger');
const { NoopApmClient } = require('../lib/apm-client/noop-apm-client');
const { REDACTED } = require('../lib/constants');

test('logging preamble', function (t) {
  const loggerCalls = [];
  const logger = createMockLogger(loggerCalls);
  const agent = new Agent();
  const origApiReqSize = process.env.ELASTIC_APM_API_REQUEST_SIZE;

  // Set options via env
  process.env.ELASTIC_APM_API_REQUEST_SIZE = '1024kb';

  // Set options via file
  const tmpDirPath = path.join(
    os.tmpdir(),
    'elastic-apm-node-test',
    String(Date.now()),
  );
  const tmpFilePath = path.join(tmpDirPath, 'elastic-apm-node-config.js');
  const tmpConfigOptions = {
    apiRequestSize: '256kb',
    apiRequestTime: '5s',
    captureExceptions: false,
  };
  mkdirp.sync(tmpDirPath);
  fs.writeFileSync(
    tmpFilePath,
    `module.exports = ${JSON.stringify(tmpConfigOptions, null, 2)}`,
  );
  t.on('end', function () {
    rimraf.sync(tmpDirPath);
  });

  // And set start options
  agent.start({
    apiRequestSize: '512kb',
    apiRequestTime: '10s',
    configFile: tmpFilePath,
    serverUrl: 'https://server-url',
    transport: () => new NoopApmClient(),
    logger,
  });

  const infoLog = loggerCalls.find((log) => log.type === 'info');
  const preambleHeader = infoLog && infoLog.message;
  const preambleData = infoLog.mergingObject;

  t.ok(
    preambleHeader.indexOf('Elastic APM Node.js Agent v') !== -1,
    'preamble header is logged',
  );
  t.ok(preambleData.agentVersion === AGENT_VERSION, 'agent version is present');
  t.deepEqual(
    preambleData.config.apiRequestSize,
    {
      source: 'environment',
      sourceValue: '1024kb',
      value: 1024 * 1024,
    },
    'apiRequestSize is taken from environment',
  );
  t.deepEqual(
    preambleData.config.apiRequestTime,
    {
      source: 'start',
      sourceValue: '10s',
      value: 10,
    },
    'apiRequestTime is taken from start options',
  );
  t.deepEqual(
    preambleData.config.captureExceptions,
    {
      source: 'file',
      value: false,
      file: tmpFilePath,
    },
    'captureExceptions is taken from file options',
  );
  t.deepEqual(
    preambleData.config.serverUrl,
    {
      source: 'start',
      value: 'https://server-url/',
      commonName: 'server_url',
    },
    'captureExceptions is taken from file options',
  );
  t.ok(
    preambleData.activationMethod === 'require',
    'preamble has activation method',
  );
  t.ok(!('logger' in preambleData.config), 'logger is not in preamble');
  t.ok(!('transport' in preambleData.config), 'transport is not in preamble');

  agent.destroy();

  process.env.ELASTIC_APM_API_REQUEST_SIZE = origApiReqSize;
  t.end();
});

test('logging preamble - secrets REDACTED', function (t) {
  const loggerCalls = [];
  const logger = createMockLogger(loggerCalls);
  const agent = new Agent();

  // And set start options
  agent.start({
    secretToken: 'secret-token',
    apiKey: 'a-secret-key',
    serverUrl: 'https://username:password@localhost:433/',
    transport: () => new NoopApmClient(),
    logger,
  });

  const infoLog = loggerCalls.find((log) => log.type === 'info');
  const preambleData = infoLog.mergingObject;

  t.ok(preambleData.config.secretToken, 'secret token is shown when given');
  t.ok(
    preambleData.config.secretToken.value === REDACTED,
    'secret token value is REDACTED',
  );
  t.ok(preambleData.config.apiKey, 'API key is shown when given');
  t.ok(
    preambleData.config.apiKey.value === REDACTED,
    'API key value is REDACTED',
  );
  t.ok(preambleData.config.serverUrl, 'server URL is shown when given');
  t.ok(
    preambleData.config.serverUrl.value ===
      `https://${REDACTED}:${REDACTED}@localhost:433/`,
    'server URL is sanitized',
  );

  agent.destroy();
  t.end();
});

test('logging preamble - logLevel === "trace"', function (t) {
  const loggerCalls = [];
  const logger = createMockLogger(loggerCalls);
  const agent = new Agent();

  // And set start options
  agent.start({
    logLevel: 'trace',
    logger,
    transport: () => new NoopApmClient(),
  });

  const infoLog = loggerCalls.find((log) => log.type === 'info');
  const preambleData = infoLog.mergingObject;

  t.ok(preambleData.startTrace, 'preamble has startTrace');
  t.ok(preambleData.dependencies, 'preamble has dependencies');

  agent.destroy();
  t.end();
});
