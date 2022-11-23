/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const path = require('path')

const errorStackParser = require('error-stack-parser')
const semver = require('semver')

var { isLambdaExecutionEnvironment } = require('./lambda')

const CONTAINS_R_ELASTIC_APM_NODE_START = /(-r\s+|--require\s*=?\s*).*elastic-apm-node\/start/

/**
 * Determine the 'agent.installation.method' metadata value from an Error
 * stack collected at `Agent.start()` time.
 *
 * XXX link to spec when there is one
 *
 * Returns one of the following values:
 * - "unknown"
 * - "require":
 *      require('elastic-apm-node').start(...)
 *      require('elastic-apm-node/start')
 * - "import":
 *      import 'elastic-apm-node/start.js'
 *      import apm from 'elastic-apm-node'; apm.start()
 * - "aws-lambda-layer": `NODE_OPTIONS` using Agent installed at /opt/nodejs/node_modules/elastic-apm-node
 * - "k8s-attacher": `NODE_OPTIONS` using Agent installed at /elastic/apm/agent/elastic-apm-node
 * - "env-attach": Fallback for any other usage of NODE_OPTIONS='-r elastic-apm-node/start'
 * - "preload": For usage of `node -r elastic-apm-node/start` without `NODE_OPTIONS`.
 */
function agentInstallationMethodFromStartStack (startStack, log) {
  /* @param {require('stackframe').StackFrame[]} frames */
  let frames
  try {
    frames = errorStackParser.parse(startStack)
  } catch (parseErr) {
    log.trace(parseErr, 'could not determine agent.installation.method')
    return 'unknown'
  }
  if (frames.length < 2) {
    return 'unknown'
  }

  // frames[0].fileName = "$topDir/lib/agent.js"
  //    at Agent.start (/Users/trentm/tmp/asdf/node_modules/elastic-apm-node/lib/agent.js:241:11)
  const topDir = path.dirname(path.dirname(frames[0].fileName))

  // If this was a preload (i.e. using `-r elastic-apm-node/start`), then
  // - node >=12: a `functionName: 'loadPreloadModules'` will be the penultimate stack frame
  // - node <12: a `functionName: 'preloadModules'` will be the last stack frame
  // (XXX at least for node v16.18.1).
  const isGte12 = semver.gte(process.version, '12.0.0', { includePrerelease: true })
  const isPreload = (isGte12
    ? frames[frames.length - 2].functionName === 'loadPreloadModules'
    : frames[frames.length - 1].functionName === 'preloadModules')
  if (isPreload) {
    if (isLambdaExecutionEnvironment && topDir === '/opt/nodejs/node_modules/elastic-apm-node') {
      // This path is defined by https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html#configuration-layers-path
      // and created by "dev-utils/make-distribution.sh".
      return 'aws-lambda-layer'
    } else if (topDir === '/elastic/apm/agent/elastic-apm-node') {
      // https://github.com/elastic/apm-mutating-webhook/blob/v0.1.0/charts/apm-attacher/values.yaml#L37
      // XXX Is there another sanity check that we are in k8s that we could use?
      return 'k8s-attacher'
    } else if (process.env.NODE_OPTIONS &&
        CONTAINS_R_ELASTIC_APM_NODE_START.test(process.env.NODE_OPTIONS)) {
      return 'env-attach'
    } else {
      return 'preload' // XXX or perhaps 'cli-attach'?
    }
  }

  // To tell if elastic-apm-node was `import`d or `require`d we look for a
  // frame with `functionName` equal 'ModuleJob.run'. This has consistently
  // been the name of this method back to at least Node v8.
  const esmImportFunctionName = 'ModuleJob.run'
  if (esmImportFunctionName) {
    for (let i = frames.length - 1; i >= 2; i--) {
      if (frames[i].functionName === esmImportFunctionName) {
        return 'import'
      }
    }
  }

  // Otherwise this was a manual `require(...)` of the agent in user code.
  return 'require'
}

module.exports = {
  agentInstallationMethodFromStartStack
}
