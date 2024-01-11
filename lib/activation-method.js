/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const path = require('path');

const errorStackParser = require('error-stack-parser');
const semver = require('semver');

var { isLambdaExecutionEnvironment } = require('./lambda');

const CONTAINS_R_ELASTIC_APM_NODE_START =
  /(-r\s+|--require\s*=?\s*).*elastic-apm-node\/start/;

/**
 * Determine the 'service.agent.activation_method' metadata value from an Error
 * stack collected at `Agent.start()` time. Spec:
 * https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#activation-method
 *
 * @param {Error} startStack - An Error object with a captured stack trace.
 *    The `stackTraceLimit` for the stack should be at least 15 -- higher
 *    that the default of 10. Using `nyc` for coverage testing adds at least
 *    one stack frame.
 * @returns {string} one of the following values:
 *    - "unknown"
 *    - "require":
 *         require('elastic-apm-node').start(...)
 *         require('elastic-apm-node/start')
 *    - "import":
 *         import 'elastic-apm-node/start.js'
 *         import apm from 'elastic-apm-node'; apm.start()
 *    - "aws-lambda-layer": `NODE_OPTIONS` using Agent installed at /opt/nodejs/node_modules/elastic-apm-node
 *    - "k8s-attach": `NODE_OPTIONS` using Agent, and `ELASTIC_APM_ACTIVATION_METHOD=K8S_ATTACH` (or `K8S` for bwcompat to earlier apm-k8s-attacher versions) in env
 *    - "env-attach": Fallback for any other usage of NODE_OPTIONS='-r elastic-apm-node/start'
 *    - "preload": For usage of `node -r elastic-apm-node/start` without `NODE_OPTIONS`.
 */
function agentActivationMethodFromStartStack(startStack, log) {
  /* @param {require('stackframe').StackFrame[]} frames */
  let frames;
  try {
    frames = errorStackParser.parse(startStack);
  } catch (parseErr) {
    log.trace(
      parseErr,
      'could not determine metadata.service.agent.activation_method',
    );
    return 'unknown';
  }
  if (frames.length < 2) {
    return 'unknown';
  }

  // frames[0].fileName = "$topDir/lib/agent.js"
  //    at Agent.start (/Users/trentm/tmp/asdf/node_modules/elastic-apm-node/lib/agent.js:241:11)
  const topDir = path.dirname(path.dirname(frames[0].fileName));

  // If this was a preload (i.e. using `-r elastic-apm-node/start`), then
  // there will be a frame with `functionName` equal to:
  // - node >=12: 'loadPreloadModules'
  // - node <12: 'preloadModules'
  const functionName = semver.gte(process.version, '12.0.0', {
    includePrerelease: true,
  })
    ? 'loadPreloadModules'
    : 'preloadModules';
  let isPreload = false;
  for (let i = frames.length - 1; i >= 2; i--) {
    if (frames[i].functionName === functionName) {
      isPreload = true;
      break;
    }
  }
  if (isPreload) {
    if (
      isLambdaExecutionEnvironment &&
      topDir === '/opt/nodejs/node_modules/elastic-apm-node'
    ) {
      // This path is defined by https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html#configuration-layers-path
      // and created by "dev-utils/make-distribution.sh".
      return 'aws-lambda-layer';
    } else if (
      process.env.ELASTIC_APM_ACTIVATION_METHOD === 'K8S_ATTACH' ||
      process.env.ELASTIC_APM_ACTIVATION_METHOD === 'K8S'
    ) {
      // apm-k8s-attacher v0.1.0 started setting value to K8S.
      // v0.4.0 will start using 'K8S_ATTACH'.
      return 'k8s-attach';
    } else if (
      process.env.NODE_OPTIONS &&
      CONTAINS_R_ELASTIC_APM_NODE_START.test(process.env.NODE_OPTIONS)
    ) {
      return 'env-attach';
    } else {
      return 'preload';
    }
  }

  // To tell if elastic-apm-node was `import`d or `require`d we look for a
  // frame with `functionName` equal to 'ModuleJob.run'. This has consistently
  // been the name of this method back to at least Node v8.
  const esmImportFunctionName = 'ModuleJob.run';
  if (esmImportFunctionName) {
    for (let i = frames.length - 1; i >= 2; i--) {
      if (frames[i].functionName === esmImportFunctionName) {
        return 'import';
      }
    }
  }

  // Otherwise this was a manual `require(...)` of the agent in user code.
  return 'require';
}

module.exports = {
  agentActivationMethodFromStartStack,
};
