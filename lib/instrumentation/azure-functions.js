/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Instrumentation of Azure Functions.
// Spec: https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md
//
// This instrumentation is started if the `FUNCTIONS_WORKER_RUNTIME` envvar
// indicates we are in an Azure Functions environment. This is different from
// most instrumentations that hook into user code `require()`ing a particular
// module.
//
// The azure-functions-nodejs-worker repo holds the "nodejsWorker.js" process
// code in which user Functions are executed. That repo monkey-patches
// `Module.prototype.require` to inject a virtual `@azure/functions-core`
// module which exposes a hooks mechanism for invocation start and end. See
// https://github.com/Azure/azure-functions-nodejs-worker/blob/v3.5.2/src/setupCoreModule.ts#L20-L54
// and `registerHook` usage below.

const fs = require('fs');
const path = require('path');

const constants = require('../constants');

let isInstrumented = false;
let hookDisposables = []; // This holds the `Disposable` objects with which to remove previously registered @azure/functions-core hooks.

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#deriving-cold-starts
let isFirstRun = true;

// The trigger types for which we support special handling.
const TRIGGER_OTHER = 1; //
const TRIGGER_HTTP = 2; // https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook
const TRIGGER_TIMER = 3; // https://learn.microsoft.com/en-ca/azure/azure-functions/functions-bindings-timer

const TRANS_TYPE_FROM_TRIGGER_TYPE = {
  [TRIGGER_OTHER]: 'request',
  [TRIGGER_HTTP]: 'request',
  // Note: `transaction.type = "scheduled"` is not in the shared APM agent spec,
  // but the Java agent used the same value for some instrumentations.
  [TRIGGER_TIMER]: 'scheduled',
};
// See APM spec and OTel `faas.trigger` at
// https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/faas/
const FAAS_TRIGGER_TYPE_FROM_TRIGGER_TYPE = {
  [TRIGGER_OTHER]: 'other',
  [TRIGGER_HTTP]: 'http',
  // Note: `faas.trigger = "timer"` is not in the shared APM agent spec yet.
  [TRIGGER_TIMER]: 'timer',
};

const gHttpRouteFromFuncDir = new Map();
const DEFAULT_ROUTE_PREFIX = 'api';
let gRoutePrefix = null;

// Mimic a subset of `FunctionInfo` from Azure code
//   https://github.com/Azure/azure-functions-nodejs-library/blob/v3.5.0/src/FunctionInfo.ts
// to help with handling.
// ...plus some additional functionality for `httpRoute` and `routePrefix`.
class FunctionInfo {
  constructor(bindingDefinitions, executionContext, log) {
    // Example `bindingDefinitions`:
    //    [{"name":"req","type":"httpTrigger","direction":"in"},
    //    {"name":"res","type":"http","direction":"out"}]
    this.triggerType = TRIGGER_OTHER;
    this.httpOutputName = '';
    this.hasHttpTrigger = false;
    this.hasReturnBinding = false;
    this.outputBindingNames = [];
    for (const bd of bindingDefinitions) {
      if (bd.direction !== 'in') {
        if (bd.type && bd.type.toLowerCase() === 'http') {
          this.httpOutputName = bd.name;
        }
        this.outputBindingNames.push(bd.name);
        if (bd.name === '$return') {
          this.hasReturnBinding = true;
        }
      }
      if (bd.type) {
        const typeLc = bd.type.toLowerCase();
        switch (typeLc) {
          case 'httptrigger': // "type": "httpTrigger"
            this.triggerType = TRIGGER_HTTP;
            break;
          case 'timertrigger':
            this.triggerType = TRIGGER_TIMER;
            break;
        }
      }
    }

    // If this is an HTTP triggered-function, then get its route template and
    // route prefix.
    // https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger#customize-the-http-endpoint
    // A possible custom "route" is not included in the given context, so we
    // attempt to load the "function.json" file. A possible custom route prefix
    // is in "host.json".
    this.httpRoute = null;
    this.routePrefix = null;
    if (this.triggerType === TRIGGER_HTTP) {
      const funcDir = executionContext.functionDirectory;
      if (!funcDir) {
        this.httpRoute = executionContext.functionName;
      } else if (gHttpRouteFromFuncDir.has(funcDir)) {
        this.httpRoute = gHttpRouteFromFuncDir.get(funcDir);
      } else {
        try {
          const fj = JSON.parse(
            fs.readFileSync(path.join(funcDir, 'function.json')),
          );
          for (let i = 0; i < fj.bindings.length; i++) {
            const binding = fj.bindings[i];
            if (
              binding.direction === 'in' &&
              binding.type &&
              binding.type.toLowerCase() === 'httptrigger'
            ) {
              if (binding.route !== undefined) {
                this.httpRoute = binding.route;
              } else {
                this.httpRoute = executionContext.functionName;
              }
              gHttpRouteFromFuncDir.set(funcDir, this.httpRoute);
            }
          }
          log.trace(
            { funcDir, httpRoute: this.httpRoute },
            'azure-functions: loaded route',
          );
        } catch (httpRouteErr) {
          log.debug(
            'azure-functions: could not determine httpRoute for function %s: %s',
            executionContext.functionName,
            httpRouteErr.message,
          );
          this.httpRoute = executionContext.functionName;
        }
      }

      if (gRoutePrefix) {
        this.routePrefix = gRoutePrefix;
      } else if (!funcDir) {
        this.routePrefix = gRoutePrefix = DEFAULT_ROUTE_PREFIX;
      } else {
        try {
          const hj = JSON.parse(
            fs.readFileSync(path.join(path.dirname(funcDir), 'host.json')),
          );
          if (
            hj &&
            hj.extensions &&
            hj.extensions.http &&
            hj.extensions.http.routePrefix !== undefined
          ) {
            const rawRoutePrefix = hj.extensions.http.routePrefix;
            this.routePrefix = gRoutePrefix = normRoutePrefix(rawRoutePrefix);
            log.trace(
              { hj, routePrefix: this.routePrefix, rawRoutePrefix },
              'azure-functions: loaded route prefix',
            );
          } else {
            this.routePrefix = gRoutePrefix = DEFAULT_ROUTE_PREFIX;
          }
        } catch (routePrefixErr) {
          log.debug(
            'azure-functions: could not determine routePrefix: %s',
            routePrefixErr.message,
          );
          this.routePrefix = gRoutePrefix = DEFAULT_ROUTE_PREFIX;
        }
      }
    }
  }
}

// Normalize a routePrefix to *not* have a leading slash.
//
// Given routePrefix='/foo' and functionName='MyFn', Microsoft.AspNetCore.Routing
// will create a route `//foo/MyFn`. Actual HTTP requests to `GET /foo/MyFn`,
// `GET //foo/MyFn`, and any number of leading slashes will work. So let's
// settle on the more typical single leading slash.
function normRoutePrefix(routePrefix) {
  return routePrefix.startsWith('/') ? routePrefix.slice(1) : routePrefix;
}

/**
 * Set transaction data for HTTP triggers from the Lambda function result.
 */
function setTransDataFromHttpTriggerResult(trans, hookCtx) {
  if (hookCtx.error) {
    trans.setOutcome(constants.OUTCOME_FAILURE);
    trans.result = 'HTTP 5xx';
    trans.res = {
      statusCode: 500,
    };
    return;
  }

  // Attempt to get what the Azure Functions system will use for the HTTP response
  // data. This is a pain because Azure Functions supports a number of different
  // ways the user can return a response. Part of the handling for this is:
  // https://github.com/Azure/azure-functions-nodejs-library/blob/v3.5.0/src/InvocationModel.ts#L77-L144
  const funcInfo = hookCtx.hookData.funcInfo;
  const result = hookCtx.result;
  const context = hookCtx.invocationContext;
  let httpRes;
  if (funcInfo.hasReturnBinding) {
    httpRes = hookCtx.result;
  } else {
    if (
      result &&
      typeof result === 'object' &&
      result[funcInfo.httpOutputName] !== undefined
    ) {
      httpRes = result[funcInfo.httpOutputName];
    } else if (
      context.bindings &&
      context.bindings[funcInfo.httpOutputName] !== undefined
    ) {
      httpRes = context.bindings[funcInfo.httpOutputName];
    } else if (context.res !== undefined) {
      httpRes = context.res;
    }
  }

  // Azure Functions requires that the HTTP output response value be an 'object',
  // otherwise it errors out the response (statusCode=500) and logs an error:
  //    Stack: Error: The HTTP response must be an 'object' type that can include properties such as 'body', 'status', and 'headers'. Learn more: https://go.microsoft.com/fwlink/?linkid=2112563
  if (typeof httpRes !== 'object') {
    trans.setOutcome(constants.OUTCOME_FAILURE);
    trans.result = 'HTTP 5xx';
    trans.res = {
      statusCode: 500,
    };
    return;
  }

  let statusCode = Number(httpRes.status);
  if (!Number.isInteger(statusCode)) {
    // While https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger
    // suggests the default may be "HTTP 204 No Content", my observation is that
    // 200 is the actual default.
    statusCode = 200;
  }

  if (statusCode < 500) {
    trans.setOutcome(constants.OUTCOME_SUCCESS);
  } else {
    trans.setOutcome(constants.OUTCOME_FAILURE);
  }
  trans.result = 'HTTP ' + statusCode.toString()[0] + 'xx';
  trans.res = {
    statusCode,
    body: httpRes.body,
  };
  if (httpRes.headers && typeof httpRes.headers === 'object') {
    trans.res.headers = httpRes.headers;
  }
}

// The Azure account id is also called the "subscription GUID".
// https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings#app-environment
function getAzureAccountId() {
  return (
    process.env.WEBSITE_OWNER_NAME &&
    process.env.WEBSITE_OWNER_NAME.split('+', 1)[0]
  );
}

// ---- exports

const isAzureFunctionsEnvironment = !!process.env.FUNCTIONS_WORKER_RUNTIME;

// Gather APM metadata for this Azure Function instance per
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#metadata
function getAzureFunctionsExtraMetadata() {
  const metadata = {
    service: {
      framework: {
        // Passing this service.framework.name to Client#setExtraMetadata()
        // ensures that it "wins" over a framework name from
        // `agent.setFramework()`, because in the client `_extraMetadata`
        // wins over `_conf.frameworkName`.
        name: 'Azure Functions',
        version: process.env.FUNCTIONS_EXTENSION_VERSION,
      },
      runtime: {
        name: process.env.FUNCTIONS_WORKER_RUNTIME,
      },
      node: {
        configured_name: process.env.WEBSITE_INSTANCE_ID,
      },
    },
    // https://github.com/elastic/apm/blob/main/specs/agents/metadata.md#azure-functions
    cloud: {
      provider: 'azure',
      region: process.env.REGION_NAME,
      service: {
        name: 'functions',
      },
    },
  };
  const accountId = getAzureAccountId();
  if (accountId) {
    metadata.cloud.account = { id: accountId };
  }
  if (process.env.WEBSITE_SITE_NAME) {
    metadata.cloud.instance = { name: process.env.WEBSITE_SITE_NAME };
  }
  if (process.env.WEBSITE_RESOURCE_GROUP) {
    metadata.cloud.project = { name: process.env.WEBSITE_RESOURCE_GROUP };
  }
  return metadata;
}

function instrument(agent) {
  if (isInstrumented) {
    return;
  }
  isInstrumented = true;

  const ins = agent._instrumentation;
  const log = agent.logger;
  let d;

  let core;
  try {
    core = require('@azure/functions-core');
  } catch (err) {
    log.warn(
      { err },
      'could not import "@azure/functions-core": skipping Azure Functions instrumentation',
    );
    return;
  }

  // Note: We *could* hook into 'appTerminate' to attempt a quick flush of the
  // current intake request. However, I have not seen a need for it yet.
  //   d = core.registerHook('appTerminate', async (hookCtx) => {
  //     log.trace('azure-functions: appTerminate')
  //     // flush here ...
  //   })
  //   hookDisposables.push(d)

  // See examples at https://github.com/Azure/azure-functions-nodejs-worker/issues/522
  d = core.registerHook('preInvocation', (hookCtx) => {
    if (!hookCtx.invocationContext) {
      // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
      return;
    }

    const context = hookCtx.invocationContext;
    const invocationId = context.invocationId;
    log.trace({ invocationId }, 'azure-functions: preInvocation');

    const isColdStart = isFirstRun;
    if (isFirstRun) {
      isFirstRun = false;
    }

    const funcInfo = (hookCtx.hookData.funcInfo = new FunctionInfo(
      context.bindingDefinitions,
      context.executionContext,
      log,
    ));
    const triggerType = funcInfo.triggerType;

    // Handle trace-context.
    // Note: We ignore the `context.traceContext`. By default it is W3C
    // trace-context that continues the given traceparent in headers. However,
    // we do not injest that span, so would get a broken distributed trace if
    // we included it.
    let traceparent;
    let tracestate;
    if (triggerType === TRIGGER_HTTP && context.req && context.req.headers) {
      traceparent =
        context.req.headers.traceparent ||
        context.req.headers['elastic-apm-traceparent'];
      tracestate = context.req.headers.tracestate;
    }

    const trans = (hookCtx.hookData.trans = ins.startTransaction(
      // This is the default name. Trigger-specific values are added below.
      context.executionContext.functionName,
      TRANS_TYPE_FROM_TRIGGER_TYPE[triggerType],
      {
        childOf: traceparent,
        tracestate,
      },
    ));

    // Expected env vars are documented at:
    // https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings
    const accountId = getAzureAccountId();
    const resourceGroup = process.env.WEBSITE_RESOURCE_GROUP;
    const fnAppName = process.env.WEBSITE_SITE_NAME;
    const fnName = context.executionContext.functionName;
    const faasData = {
      trigger: {
        type: FAAS_TRIGGER_TYPE_FROM_TRIGGER_TYPE[triggerType],
      },
      execution: invocationId,
      coldstart: isColdStart,
    };
    if (accountId && resourceGroup && fnAppName) {
      faasData.id = `/subscriptions/${accountId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites/${fnAppName}/functions/${fnName}`;
    }
    if (fnAppName && fnName) {
      faasData.name = `${fnAppName}/${fnName}`;
    }
    trans.setFaas(faasData);

    if (triggerType === TRIGGER_HTTP) {
      // The request object is the first item in `hookCtx.inputs`. See:
      // https://github.com/Azure/azure-functions-nodejs-worker/blob/v3.5.2/src/eventHandlers/InvocationHandler.ts#L127
      const req = hookCtx.inputs[0];
      if (req) {
        trans.req = req; // Used for setting `trans.context.request` by `getContextFromRequest()`.
        if (agent._conf.usePathAsTransactionName && req.url) {
          trans.setDefaultName(`${req.method} ${new URL(req.url).pathname}`);
        } else {
          const route = funcInfo.routePrefix
            ? `/${funcInfo.routePrefix}/${funcInfo.httpRoute}`
            : `/${funcInfo.httpRoute}`;
          trans.setDefaultName(`${req.method} ${route}`);
        }
      }
    }
  });
  hookDisposables.push(d);

  d = core.registerHook('postInvocation', (hookCtx) => {
    if (!hookCtx.invocationContext) {
      // Doesn't look like `require('@azure/functions-core').PreInvocationContext`. Abort.
      return;
    }
    const invocationId = hookCtx.invocationContext.invocationId;
    log.trace({ invocationId }, 'azure-functions: postInvocation');

    const trans = hookCtx.hookData.trans;
    if (!trans) {
      return;
    }

    const funcInfo = hookCtx.hookData.funcInfo;
    if (funcInfo.triggerType === TRIGGER_HTTP) {
      setTransDataFromHttpTriggerResult(trans, hookCtx);
    } else if (hookCtx.error) {
      trans.result = constants.RESULT_FAILURE;
      trans.setOutcome(constants.OUTCOME_FAILURE);
    } else {
      trans.result = constants.RESULT_SUCCESS;
      trans.setOutcome(constants.OUTCOME_SUCCESS);
    }

    if (hookCtx.error) {
      // Capture the error before trans.end() so it associates with the
      // current trans. `skipOutcome` to avoid setting outcome on a possible
      // currentSpan, because this error applies to the transaction, not any
      // sub-span.
      agent.captureError(hookCtx.error, { skipOutcome: true });
    }

    trans.end();
  });
  hookDisposables.push(d);
}

function uninstrument() {
  if (!isInstrumented) {
    return;
  }
  isInstrumented = false;

  // Unregister `core.registerHook()` calls from above.
  hookDisposables.forEach((d) => {
    d.dispose();
  });
  hookDisposables = [];
}

module.exports = {
  isAzureFunctionsEnvironment,
  getAzureFunctionsExtraMetadata,
  instrument,
  uninstrument,
};
