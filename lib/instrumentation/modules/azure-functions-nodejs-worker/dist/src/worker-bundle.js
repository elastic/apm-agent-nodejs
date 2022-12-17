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

// Mimic a subset of `FunctionInfo` from Azure code to help with handling
// https://github.com/Azure/azure-functions-nodejs-library/blob/v3.5.0/src/FunctionInfo.ts
class FunctionInfo {
  constructor (bindingDefinitions) {
    // Example `bindingDefinitions`:
    //    [{"name":"req","type":"httpTrigger","direction":"in"},
    //    {"name":"res","type":"http","direction":"out"}]
    this.httpOutputName = ''
    this.hasHttpTrigger = false
    this.hasReturnBinding = false
    this.outputBindingNames = []
    for (const bd of bindingDefinitions) {
      if (bd.direction !== 'in') {
        if (bd.type && bd.type.toLowerCase() === 'http') {
          this.httpOutputName = bd.name
        }
        this.outputBindingNames.push(bd.name)
        if (bd.name === '$return') {
          this.hasReturnBinding = true
        }
      }
      if (bd.type && bd.type.toLowerCase() === 'httptrigger') {
        this.hasHttpTrigger = true
      }
    }
  }
}

/**
 * Set transaction data for HTTP triggers from the Lambda function result.
 */
function setTransDataFromHttpTriggerResult (trans, hookCtx) {
  // console.log('XXX hookCtx:'); console.dir(hookCtx, { depth: 5 })
  // console.log('XXX hookCtx.invocationContext:', hookCtx.invocationContext)
  if (hookCtx.error) {
    trans.setOutcome(constants.OUTCOME_FAILURE)
    trans.result = 'HTTP 5xx'
    trans.res = {
      statusCode: 500
    }
    return
  }

  // Attempt to get what the Azure Functions system will use for the HTTP response
  // data. This is a pain because Azure Functions supports a number of different
  // ways the user can return a response. Part of the handling for this is:
  // https://github.com/Azure/azure-functions-nodejs-library/blob/v3.5.0/src/InvocationModel.ts#L77-L144
  const funcInfo = hookCtx.hookData.funcInfo
  const result = hookCtx.result
  const context = hookCtx.invocationContext
  let httpRes
  if (funcInfo.hasReturnBinding) {
    httpRes = hookCtx.result
  } else {
    if (result && typeof result === 'object' && result[funcInfo.httpOutputName] !== undefined) {
      httpRes = result[funcInfo.httpOutputName]
    } else if (context.bindings && context.bindings[funcInfo.httpOutputName] !== undefined) {
      httpRes = context.bindings[funcInfo.httpOutputName]
    } else if (context.res !== undefined) {
      httpRes = context.res
    }
  }

  // Azure Functions requires that the HTTP output response value be an 'object',
  // otherwise it errors out the response (statusCode=500) and logs an error:
  //    Stack: Error: The HTTP response must be an 'object' type that can include properties such as 'body', 'status', and 'headers'. Learn more: https://go.microsoft.com/fwlink/?linkid=2112563
  if (typeof httpRes !== 'object') {
    trans.setOutcome(constants.OUTCOME_FAILURE)
    trans.result = 'HTTP 5xx'
    trans.res = {
      statusCode: 500
    }
    return
  }

  // XXX default is 204 in latest? per https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=in-process%2Cfunctionsv2&pivots=programming-language-javascript
  //      `func start` tests show me 200.
  let statusCode = Number(httpRes.status)
  if (!Number.isInteger(statusCode)) {
    statusCode = 200
  }

  if (statusCode < 500) {
    trans.setOutcome(constants.OUTCOME_SUCCESS)
  } else {
    trans.setOutcome(constants.OUTCOME_FAILURE)
  }
  trans.result = 'HTTP ' + statusCode.toString()[0] + 'xx'
  trans.res = {
    statusCode,
    body: httpRes.body
  }
  if (httpRes.headers && typeof httpRes.headers === 'object') {
    trans.res.headers = httpRes.headers
  }
}

module.exports = function (mod, agent, { name, version, enabled }) {
  const ins = agent._instrumentation
  const log = agent.logger

  // Guards on whether to instrument.
  if (!enabled) {
    return mod
  }
  // Limitation: We do not currently guard on the specific `azure-functions-nodejs-worker`
  // version when running via `func start` (local dev/testing mode). The `func`
  // tool is provided in the `azure-functions-core-tools` package, which
  // *includes* the former at `node_modules/azure-functions-core-tools/bin/workers/node/...`.
  // However, RITM currently prefers to infer the package name from
  // "node_modules" in the path, so we get the `version` of the ...-core-tools
  // package and not the ...-nodejs-worker package.
  if (name.startsWith('azure-functions-nodejs-worker/') && !semver.satisfies(version, '>=3.0.0 <4.0.0')) {
    log.debug('azure-functions-nodejs-worker@%s not supported', version)
    return mod
  }
  if (!semver.satisfies(process.version, '>=14 <20')) {
    // We are assuming FUNCTIONS_EXTENSION_VERSION=~4.
    // https://aka.ms/functions-node-versions
    log.debug('Azure Functions runtime ~4 does not support node %s: skipping Azure Functions instrumentation', process.version)
    return mod
  }
  if (!(mod.worker && mod.worker.startNodeWorker)) {
    log.debug('azure-functions-nodejs-worker@%s is not supported (no `mod.worker.startNodeWorker`): skipping Azure Functions instrumentation', version)
    return mod
  }
  // Per the spec, this envvar is used to decide if we are in an Azure Function.
  // https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#disabled-functionality
  if (!process.env.FUNCTIONS_WORKER_RUNTIME) {
    log.debug('FUNCTIONS_WORKER_RUNTIME envvar is not set: skipping Azure Functions instrumentation', version)
    return mod
  }

  shimmer.wrap(mod.worker, 'startNodeWorker', wrapStartNodeWorker)
  return mod

  function setupInstrumentation () {
    let core
    try {
      core = require('@azure/functions-core')
    } catch (coreErr) {
      log.warn('could not import "@azure/functions-core": skipping Azure Functions instrumentation')
      return
    }

    // See examples at https://github.com/Azure/azure-functions-nodejs-worker/issues/522
    core.registerHook('preInvocation', (hookCtx) => {
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
        return
      }

      const context = hookCtx.invocationContext
      const isColdStart = isFirstRun
      if (isFirstRun) {
        isFirstRun = false
      }

      // XXX if don't use this in preInvocation, then move it to postInvocation.
      hookCtx.hookData.funcInfo = new FunctionInfo(context.bindingDefinitions)

      // XXX assuming http trigger for now, use funcInfo
      // - per https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=in-process%2Cfunctionsv2&pivots=programming-language-javascript
      //   HTTP trigger has type==="httpTrigger" in function.json
      const triggerType = hookCtx.hookData.triggerType = TRIGGER_HTTP

      // XXX handle trace-context. Do we use context.traceContext??? Because the
      //     traceparent there is from Application Request Router (ARR), I think.
      //     and that is NOT monitored, so we'd have broken traces. So perhaps
      //     assume the equiv of `trace_continuation_strategy=restart_external`?
      //    - what about using that context.traceContext for a *span link*? Only
      //      if there were a hope at having that trace to link to somewhere.
      const trans = hookCtx.hookData.trans = ins.startTransaction(
        // This is the default name. Trigger-specific values are added below.
        context.executionContext.functionName,
        TRANS_TYPE_FROM_TRIGGER_TYPE[triggerType])

      // Expected env vars are documented at:
      // https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings
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

      // XXX consider trans.setCloudContext({ origin: { ... }}) ?
      // XXX trans.setServiceContext()

      if (triggerType === TRIGGER_HTTP) {
        // The request object is the first item in `hookCtx.inputs`. See:
        // https://github.com/Azure/azure-functions-nodejs-worker/blob/v3.5.2/src/eventHandlers/InvocationHandler.ts#L127
        const req = hookCtx.inputs[0]
        if (req && req.url) {
          // XXX use function.json 'route', if available, else consider using
          //     `/api/${context.executionContext.functionName}`
          //     because that case is more normalized than whatever
          //     case-insensitive URL path was used.
          trans.setDefaultName(`${req.method} ${new URL(req.url).pathname}`)
          // Used for setting `trans.context.request`.
          trans.req = req
        }
      }
    })

    // // This partially mimics `InvocationModel#getResponse()` from Azure code to
    // // determine the function response from the various supported ways a user
    // // can return that response: return value, `context.bindings.*`, or
    // // `context.res`.
    // // https://github.com/Azure/azure-functions-nodejs-library/blob/v3.5.0/src/InvocationModel.ts#L77-L144
    // function getResponse (funcInfo, context, result) {
    //   const bindings = Object.assign({}, context.bindings) // local shallow copy

    //   // As a special case, user code can set `context.res` for the response of
    //   // an HTTP trigger.
    //   if (funcInfo.httpOutputName && context.res && context.bindings[funcInfo.httpOutputName] === undefined) {
    //     bindings[funcInfo.httpOutputName] = context.res
    //   }

    //   const response = {}
    //   // - for each output binding name
    //   //
    //   // XXX I don't grok the "response.returnValue" that doesn't impact "response.outputData". Hrm.
    //   if (result !== null) {

    //   }
    // }

    core.registerHook('postInvocation', (hookCtx) => {
      if (!hookCtx.invocationContext) {
        // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
        return
      }
      const trans = hookCtx.hookData.trans
      if (!trans) {
        return
      }

      if (hookCtx.hookData.triggerType === TRIGGER_HTTP) {
        setTransDataFromHttpTriggerResult(trans, hookCtx)
      } else if (hookCtx.error) {
        trans.result = constants.RESULT_FAILURE
        trans.setOutcome(constants.OUTCOME_FAILURE)
      } else {
        trans.result = constants.RESULT_SUCCESS
        trans.setOutcome(constants.OUTCOME_SUCCESS)
      }

      if (hookCtx.error) {
        // Capture the error before trans.end() so it associates with the
        // current trans. `skipOutcome` to avoid setting outcome on a possible
        // currentSpan, because this error applies to the transaction, not any
        // sub-span.
        agent.captureError(hookCtx.error, { skipOutcome: true })
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
