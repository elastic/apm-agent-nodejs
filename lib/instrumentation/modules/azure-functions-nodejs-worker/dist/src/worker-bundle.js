/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// XXX 'splain
// - node nodejsWorker.js (with NODE_OPTIONS), which does `require('./worker-bundle.js')`
//   and calls its `.startNodeWorker()`, which hacks in the `@azure/functions-core`
//   module API for execution hooks that we use for instr.
// - function execution hooks are explained here: https://github.com/Azure/azure-functions-nodejs-worker/issues/522
//   XXX is there a doc *ref* for that?

const semver = require('semver')

const shimmer = require('../../../../shimmer')

module.exports = function (mod, agent, { version, enabled }) {
  const ins = agent._instrumentation
  const log = agent.logger

  if (!enabled) {
    return mod
  }
  if (!semver.satisfies(version, '>=3.0.0 <4.0.0')) {
    log.debug('azure-functions-nodejs-worker@%s not supported', version)
  }
  if (!(mod.worker && mod.worker.startNodeWorker)) {
    log.debug('azure-functions-nodejs-worker@%s is not supported (no `mod.worker.startNodeWorker`): skipping Azure Functions instrumentation', version)
    return mod
  }
  if (!process.env.WEBSITE_SITE_NAME) {
    log.debug('WEBSITE_SITE_NAME envvar is not set: skipping Azure Functions instrumentation', version)
    return mod
  }

  shimmer.wrap(mod.worker, 'startNodeWorker', wrapStartNodeWorker)
  return mod

  // XXX guard on this failing with a warning that APM doesn't work? Yup.
  //     Only try if WEBSITE_SITE_NAME is defined.
  function setupInstrumentation () {
    const { registerHook } = require('@azure/functions-core')

    // See examples at https://github.com/Azure/azure-functions-nodejs-worker/issues/522
    registerHook('preInvocation', (hookCtx) => {
      console.log('XXX -- hook preInvocation')
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`.
        return
      }

      // XXX handle coldstart
      // XXX handle setting metadata (a la getMetadata() in lambda.js)

      const context = hookCtx.invocationContext
      // XXX handle trace-context. Do we use context.traceContext??? Because the
      //     traceparent there is from Application Request Router (ARR), I think.
      //     and that is NOT monitored, so we'd have broken traces. So perhaps
      //     assume the equiv of `trace_continuation_strategy=restart_external`?
      const trans = ins.startTransaction(context.executionContext.functionName)
      hookCtx.hookData.trans = trans
      // XXX set trans start data fields
      // XXX trigger-specific trans.name, etc.
      trans.type = 'request'
      // XXX use trans.setDefaultName() ??? as lambda.js does

      // https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings
      // - WEBSITE_OWNER_NAME includes the subscription GUID
      //      <subcription GUID>+<resource name>-<region short name>webspace...
      //   e.g. 'ba0aeee7-76ca-482e-86a6-83f09ba31e47+a-resourcegroup-name-WestUS2webspace'
      // XXX This block could be more defensive.
      const subscriptionGuid = process.env.WEBSITE_OWNER_NAME.split('+')[0]
      const resourceGroup = process.env.WEBSITE_RESOURCE_GROUP
      const fnAppName = process.env.WEBSITE_SITE_NAME
      const fnName = context.executionContext.functionName
      trans.setFaas({
        id: `/subscriptions/${subscriptionGuid}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${fnAppName}/functions/${fnName}`,
        name: `${fnAppName}/${fnName}`,
        // XXX coldstart
        execution: context.invocationId,
        trigger: {
          type: 'http' // XXX trigger-specific
        }
      })
      trans.setCloudContext({
        origin: {
          provider: 'azure' // XXX is this right?
          // service.name  // XXX e.g. 'api gateway' in lambda.js
          // account.id    // XXX
        }
      })
      // XXX trans.setServiceContext()
      // XXX can we set `trans.req` from context.bindings directly? Trigger-specific.
    })

    registerHook('postInvocation', (hookCtx) => {
      console.log('XXX -- hook postInvocation')
      console.log('XXX hookCtx: ', hookCtx)
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`.
        return
      }
      const trans = hookCtx.hookData.trans
      if (!trans) {
        return
      }
      const context = hookCtx.invocationContext
      // XXX trans.outcome
      // XXX trans.result
      // XXX trans.res from `context.result` et al?
      //    *Maybe*. I think we skip this for first effort. The handling of getting
      //    the result from the retval, the function bindings, special casing of
      //    `context.res` for an httpTrigger means this is baroque. It is defined
      //    by `InvocationModel.getResponse()` in azure-functions-nodejs-library.
      if (context.error) {
        console.log('XXX TODO capture error for trans', context.error)
      }
      trans.end()
      // XXX do we flush? If so, short `inflightTimeout`?
    })
  }

  // https://github.com/Azure/azure-functions-nodejs-worker/blob/v3.5.1/src/Worker.ts#L15
  function wrapStartNodeWorker (orig) {
    return function wrappedStartNodeWorker () {
      const retval = orig.apply(this, arguments)
      setupInstrumentation()
      return retval
    }
  }
}
