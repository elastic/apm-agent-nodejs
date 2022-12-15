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

const { getAzureAccountId } = require('../../../../../azure-functions')
const constants = require('../../../../../constants')
const shimmer = require('../../../../shimmer')

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#deriving-cold-starts
let isFirstRun = true

// The trigger types for which we support special handling.
const TRIGGER_GENERIC = 1 // XXX
const TRIGGER_HTTP = 2 // https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook

const TRANS_TYPE_FROM_TRIGGER_TYPE = {
  [TRIGGER_GENERIC]: 'request',
  [TRIGGER_HTTP]: 'request'
}
const FAAS_TRIGGER_TYPE_FROM_TRIGGER_TYPE = {
  [TRIGGER_GENERIC]: 'other',
  [TRIGGER_HTTP]: 'http'
}

/**
 * Set transaction data for HTTP triggers from the Lambda function result.
 */
function setTransDataFromHttpTriggerResult (hookCtx, trans) {
  if (hookCtx.error) {
    // XXX verify that this results in an actually 5xx from the Azure Function curl call
    trans.result = 'HTTP 5xx'
  // XXX do we have a reliable statusCode object loc? It defaults to 200 I think, right?
  //    XXX default is 204 in latest? per https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=in-process%2Cfunctionsv2&pivots=programming-language-javascript
  // } else if (result && result.statusCode) {
  //   trans.result = 'HTTP ' + result.statusCode.toString()[0] + 'xx'
  } else {
    trans.result = constants.RESULT_SUCCESS
  }

  // XXX
  // // This doc defines the format of API Gateway-triggered responses, from which
  // // we can infer `transaction.context.response` values.
  // // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response
  // if (err) {
  //   trans.res = {
  //     statusCode: 500
  //   }
  // } else if (event.requestContext.http) { // payload format version 2.0
  //   if (result && result.statusCode) {
  //     trans.res = {
  //       statusCode: result.statusCode,
  //       headers: result.headers
  //     }
  //   } else {
  //     trans.res = {
  //       statusCode: 200,
  //       headers: { 'content-type': 'application/json' }
  //     }
  //   }
  // } else { // payload format version 1.0
  //   if (result && result.statusCode) {
  //     trans.res = {
  //       statusCode: result.statusCode,
  //       headers: result.headers
  //     }
  //   }
  // }
}

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
  // Per the spec, this envvar is used to decide if we in an Azure Function.
  // https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#disabled-functionality
  if (!process.env.FUNCTIONS_WORKER_RUNTIME) {
    log.debug('FUNCTIONS_WORKER_RUNTIME envvar is not set: skipping Azure Functions instrumentation', version)
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
      // console.log('XXX env', process.env)
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
        return
      }

      const context = hookCtx.invocationContext
      const isColdStart = isFirstRun
      if (isFirstRun) {
        isFirstRun = false
      }

      // XXX assuming http trigger for now
      // - per https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=in-process%2Cfunctionsv2&pivots=programming-language-javascript
      //   HTTP trigger has type==="httpTrigger" in function.json
      const triggerType = hookCtx.hookData.triggerType = TRIGGER_HTTP

      let transName = context.executionContext.functionName
      if (triggerType === TRIGGER_HTTP) {
        // XXX might not be `context.req`, use function.json parse
        if (context.req && context.req.url) {
          const req = context.req
          // XXX use function.json 'route', if available, else consider using
          //     `/api/${context.executionContext.functionName}`
          //     because that case is more normalized than whatever
          //     case-insensitive URL path was used.
          transName = `${req.method} ${new URL(req.url).pathname}`
        }
      }

      // XXX handle trace-context. Do we use context.traceContext??? Because the
      //     traceparent there is from Application Request Router (ARR), I think.
      //     and that is NOT monitored, so we'd have broken traces. So perhaps
      //     assume the equiv of `trace_continuation_strategy=restart_external`?
      //    - what about using that context.traceContext for a *span link*? Only
      //      if there were a hope at having that trace to link to somewhere.
      const trans = hookCtx.hookData.trans = ins.startTransaction(
        transName,
        TRANS_TYPE_FROM_TRIGGER_TYPE[triggerType])

      // https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings
      // - WEBSITE_OWNER_NAME includes the subscription GUID
      //      <subcription GUID>+<resource name>-<region short name>webspace...
      //   e.g. 'ba0aeee7-76ca-482e-86a6-83f09ba31e47+a-resourcegroup-name-WestUS2webspace'
      // - Many of these envvars are not defined by `func start` for local testing.
      // XXX This block could be more defensive.
      // XXX `func start`: no WEBSITE_OWNER_NAME, no WEBSITE_SITE_NAME,
      // console.log('XXX context: ', context)
      const accountId = getAzureAccountId()
      const resourceGroup = process.env.WEBSITE_RESOURCE_GROUP
      const fnAppName = process.env.WEBSITE_SITE_NAME
      const fnName = context.executionContext.functionName
      const faasData = {
        trigger: {
          type: FAAS_TRIGGER_TYPE_FROM_TRIGGER_TYPE[triggerType]
        },
        execution: context.invocationId,
        coldstart: isColdStart
      }
      if (accountId && resourceGroup && fnAppName) {
        faasData.id = `/subscriptions/${accountId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${fnAppName}/functions/${fnName}`
      }
      if (fnAppName && fnName) {
        faasData.name = `${fnAppName}/${fnName}`
      }
      trans.setFaas(faasData)
      // trans.setCloudContext({ // XXX discuss on spec
      //   origin: {
      //     provider: 'azure' // XXX is this right?
      //     // service.name  // XXX e.g. 'api gateway' in lambda.js
      //     // account.id    // XXX
      //   }
      // })
      // XXX trans.setServiceContext()
      // XXX http context
      //  - can we set `trans.req` from context.bindings directly? Trigger-specific.
      //  - are we attempting 'res' context or bailing because baroqueness?
    })

    registerHook('postInvocation', (hookCtx) => {
      console.log('XXX -- hook postInvocation')
      // console.log('XXX hookCtx: ', hookCtx)
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
        return
      }
      const trans = hookCtx.hookData.trans
      if (!trans) {
        return
      }

      // XXX trans.outcome
      // const context = hookCtx.invocationContext
      if (hookCtx.hookData.triggerType === TRIGGER_HTTP) {
        console.log('XXX setTransDataFromHttpTriggerResult(err, result, trans, event, triggerType)')
        setTransDataFromHttpTriggerResult(hookCtx, trans)
      } else if (hookCtx.error) {
        trans.result = constants.RESULT_FAILURE
      } else {
        trans.result = constants.RESULT_SUCCESS
      }

      // XXX trans.result  // XXX do the if triggerType === 'http' thing a la lambda
      // XXX trans.res from `context.result` et al?
      //    *Maybe*. I think we skip this for first effort. The handling of getting
      //    the result from the retval, the function bindings, special casing of
      //    `context.res` for an httpTrigger means this is baroque. It is defined
      //    by `InvocationModel.getResponse()` in azure-functions-nodejs-library.
      if (hookCtx.error) {
        console.log('XXX capture error for trans', hookCtx.error)
        // Capture the error before trans.end() so it associates with the
        // current trans. `skipOutcome` to avoid setting outcome on a possible
        // currentSpan, because this error applies to the transaction, not any
        // sub-span.
        agent.captureError(hookCtx.error, { skipOutcome: true })
        trans.setOutcome(constants.OUTCOME_FAILURE)
      } else {
        trans.setOutcome(constants.OUTCOME_SUCCESS)
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
