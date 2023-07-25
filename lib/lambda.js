/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('./constants');
const shimmer = require('./instrumentation/shimmer');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const { MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT } = require('./constants');

// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#deriving-cold-starts
let isFirstRun = true;
let gFaasId; // Set on first invocation.

// The trigger types for which we support special handling.
// https://docs.aws.amazon.com/lambda/latest/dg/lambda-services.html
const TRIGGER_GENERIC = 1;
const TRIGGER_API_GATEWAY = 2; // This includes Lambda URLs which use the same event format.
const TRIGGER_SNS = 3;
const TRIGGER_SQS = 4;
const TRIGGER_S3_SINGLE_EVENT = 5;
const TRIGGER_ELB = 6; // Elastic Load Balancer, aka Application Load Balancer

function triggerTypeFromEvent(event) {
  if (event.requestContext) {
    if (event.requestContext.elb) {
      return TRIGGER_ELB;
    } else if (event.requestContext.requestId) {
      return TRIGGER_API_GATEWAY;
    }
  }
  if (event.Records && event.Records.length >= 1) {
    const eventSource =
      event.Records[0].eventSource || // S3 and SQS
      event.Records[0].EventSource; // SNS
    if (eventSource === 'aws:sns') {
      return TRIGGER_SNS;
    } else if (eventSource === 'aws:sqs') {
      return TRIGGER_SQS;
    } else if (eventSource === 'aws:s3' && event.Records.length === 1) {
      return TRIGGER_S3_SINGLE_EVENT;
    }
  }
  return TRIGGER_GENERIC;
}

// Gather APM metadata for this Lambda executor per
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-aws-lambda.md#overwriting-metadata
function getMetadata(agent, cloudAccountId) {
  return {
    service: {
      framework: {
        // Passing this service.framework.name to Client#setExtraMetadata()
        // ensures that it "wins" over a framework name from
        // `agent.setFramework()`, because in the client `_extraMetadata`
        // wins over `_conf.frameworkName`.
        name: 'AWS Lambda',
      },
      runtime: {
        name: process.env.AWS_EXECUTION_ENV,
      },
      node: {
        configured_name: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
      },
    },
    cloud: {
      provider: 'aws',
      region: process.env.AWS_REGION,
      service: {
        name: 'lambda',
      },
      account: {
        id: cloudAccountId,
      },
    },
  };
}

function getFaasData(context, faasId, isColdStart, faasTriggerType, requestId) {
  const faasData = {
    id: faasId,
    name: context.functionName,
    version: context.functionVersion,
    coldstart: isColdStart,
    execution: context.awsRequestId,
    trigger: {
      type: faasTriggerType,
    },
  };
  if (requestId) {
    faasData.trigger.request_id = requestId;
  }
  return faasData;
}

function setGenericData(trans, event, context, faasId, isColdStart) {
  trans.type = 'request';
  trans.setDefaultName(context.functionName);

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'other'));

  const cloudContext = {
    origin: {
      provider: 'aws',
    },
  };
  trans.setCloudContext(cloudContext);
}

// Set transaction data for an API Gateway triggered invocation.
//
// Handle API Gateway payload format vers 1.0 (a.k.a "REST") and 2.0 ("HTTP").
// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
function setApiGatewayData(agent, trans, event, context, faasId, isColdStart) {
  const requestContext = event.requestContext;

  let name;
  let pseudoReq;
  if (requestContext.http) {
    // 2.0
    if (agent._conf.usePathAsTransactionName) {
      name = `${requestContext.http.method} ${requestContext.http.path}`;
    } else {
      // Get a routeKeyPath from the routeKey:
      //    GET /some/path  ->  /some/path
      //    ANY /some/path  ->  /some/path
      //    $default        ->  /$default
      let routeKeyPath = requestContext.routeKey;
      const spaceIdx = routeKeyPath.indexOf(' ');
      if (spaceIdx === -1) {
        routeKeyPath = '/' + routeKeyPath;
      } else {
        routeKeyPath = routeKeyPath.slice(spaceIdx + 1);
      }
      name = `${requestContext.http.method} /${requestContext.stage}${routeKeyPath}`;
    }
    pseudoReq = {
      httpVersion: requestContext.http.protocol
        ? requestContext.http.protocol.split('/')[1] // 'HTTP/1.1' -> '1.1'
        : undefined,
      method: requestContext.http.method,
      url:
        event.rawPath +
        (event.rawQueryString ? '?' + event.rawQueryString : ''),
      headers: event.normedHeaders || {},
      socket: { remoteAddress: requestContext.http.sourceIp },
      body: event.body,
    };
  } else {
    // payload version format 1.0
    if (agent._conf.usePathAsTransactionName) {
      name = `${requestContext.httpMethod} ${requestContext.path}`;
    } else {
      name = `${requestContext.httpMethod} /${requestContext.stage}${requestContext.resourcePath}`;
    }
    pseudoReq = {
      httpVersion: requestContext.protocol
        ? requestContext.protocol.split('/')[1] // 'HTTP/1.1' -> '1.1'
        : undefined,
      method: requestContext.httpMethod,
      url:
        requestContext.path +
        (event.queryStringParameters
          ? '?' + querystring.encode(event.queryStringParameters)
          : ''),
      headers: event.normedHeaders || {},
      socket: {
        remoteAddress:
          requestContext.identity && requestContext.identity.sourceIp,
      },
      // Limitation: Note that `getContextFromRequest` does *not* use this body,
      // because API Gateway payload format 1.0 does not include the
      // Content-Length header from the original request.
      body: event.body,
    };
  }
  trans.type = 'request';
  trans.setDefaultName(name);
  trans.req = pseudoReq; // Used by parsers.getContextFromRequest() for adding context to transaction and errors.

  trans.setFaas(
    getFaasData(context, faasId, isColdStart, 'http', requestContext.requestId),
  );

  const serviceContext = {
    origin: {
      name: requestContext.domainName,
      id: requestContext.apiId,
      version: event.version || '1.0',
    },
  };
  trans.setServiceContext(serviceContext);

  const originSvcName =
    // `<url-id>.lambda-url.<region>.on.aws` indicates this is a Lambda URL.
    requestContext.domainName &&
    requestContext.domainPrefix &&
    requestContext.domainName.startsWith(
      requestContext.domainPrefix + '.lambda-url.',
    )
      ? 'lambda url'
      : 'api gateway';
  const cloudContext = {
    origin: {
      provider: 'aws',
      service: {
        name: originSvcName,
      },
      account: {
        id: requestContext.accountId,
      },
    },
  };
  trans.setCloudContext(cloudContext);
}

function setTransDataFromApiGatewayResult(err, result, trans, event) {
  if (err) {
    trans.result = 'HTTP 5xx';
    trans._setOutcomeFromHttpStatusCode(500);
  } else if (result && result.statusCode) {
    trans.result = 'HTTP ' + result.statusCode.toString()[0] + 'xx';
    trans._setOutcomeFromHttpStatusCode(result.statusCode);
  } else {
    trans.result = constants.RESULT_SUCCESS;
    trans._setOutcomeFromHttpStatusCode(200);
  }

  // This doc defines the format of API Gateway-triggered responses, from which
  // we can infer `transaction.context.response` values.
  // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response
  // https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html#urls-payloads
  if (err) {
    trans.res = {
      statusCode: 500,
    };
  } else if (event.requestContext.http) {
    // payload format version 2.0
    if (result && result.statusCode) {
      trans.res = {
        statusCode: result.statusCode,
        headers: result.headers,
      };
    } else {
      trans.res = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
      };
    }
  } else {
    // payload format version 1.0
    if (result && result.statusCode) {
      trans.res = {
        statusCode: result.statusCode,
        headers: result.headers,
      };
    }
  }
}

// https://docs.aws.amazon.com/lambda/latest/dg/services-alb.html
function setElbData(agent, trans, event, context, faasId, isColdStart) {
  trans.type = 'request';
  let name;
  if (agent._conf.usePathAsTransactionName) {
    name = `${event.httpMethod} ${event.path}`;
  } else {
    name = `${event.httpMethod} unknown route`;
  }
  trans.setDefaultName(name);
  trans.req = {
    // Used by parsers.getContextFromRequest() for adding context to transaction and errors.
    method: event.httpMethod,
    url:
      event.path +
      (event.queryStringParameters &&
      Object.keys(event.queryStringParameters) > 0
        ? '?' + querystring.encode(event.queryStringParameters)
        : ''),
    headers: event.normedHeaders || {},
    body: event.body,
    bodyIsBase64Encoded: event.isBase64Encoded,
  };

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'http'));

  const targetGroupArn = event.requestContext.elb.targetGroupArn;
  const arnParts = targetGroupArn.split(':');
  trans.setServiceContext({
    origin: {
      name: arnParts[5].split('/')[1],
      id: targetGroupArn,
    },
  });

  trans.setCloudContext({
    origin: {
      provider: 'aws',
      region: arnParts[3],
      service: {
        name: 'elb',
      },
      account: {
        id: arnParts[4],
      },
    },
  });
}

function setTransDataFromElbResult(err, result, trans) {
  // ELB defaults to 502 Bad Gateway if there is an error or `result.statusCode`
  // is missing or not an integer.
  const validStatusCode =
    result &&
    result.statusCode &&
    typeof result.statusCode === 'number' &&
    Number.isInteger(result.statusCode)
      ? result.statusCode
      : null;

  if (err) {
    trans.result = 'HTTP 5xx';
  } else if (validStatusCode) {
    trans.result = 'HTTP ' + validStatusCode.toString()[0] + 'xx';
  } else {
    trans.result = 'HTTP 5xx';
  }

  // Set an appropriate pseudo `trans.res`, used by `parsers.getContextFromResponse()`.
  if (err) {
    trans.res = {
      statusCode: 502,
    };
  } else {
    trans.res = {
      statusCode: validStatusCode || 502,
      headers: result.headers,
    };
  }

  trans._setOutcomeFromHttpStatusCode(validStatusCode || 502);
}

function setSqsData(agent, trans, event, context, faasId, isColdStart) {
  const record = event && event.Records && event.Records[0];
  const eventSourceARN = record.eventSourceARN ? record.eventSourceARN : '';

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'pubsub'));

  const arnParts = eventSourceARN.split(':');
  const queueName = arnParts[5];
  const accountId = arnParts[4];

  trans.setDefaultName(`RECEIVE ${queueName}`);
  trans.type = 'messaging';

  const serviceContext = {
    origin: {
      name: queueName,
      id: eventSourceARN,
    },
  };
  trans.setServiceContext(serviceContext);

  const cloudContext = {
    origin: {
      provider: 'aws',
      region: record.awsRegion,
      service: {
        name: 'sqs',
      },
      account: {
        id: accountId,
      },
    },
  };
  trans.setCloudContext(cloudContext);

  const links = spanLinksFromSqsRecords(event.Records);
  trans._addLinks(links);
}

function setSnsData(agent, trans, event, context, faasId, isColdStart) {
  const record = event && event.Records && event.Records[0];
  const sns = record && record.Sns;

  trans.setFaas(getFaasData(context, faasId, isColdStart, 'pubsub'));

  const topicArn = (sns && sns.TopicArn) || '';
  const arnParts = topicArn.split(':');
  const topicName = arnParts[5];
  const accountId = arnParts[4];
  const region = arnParts[3];

  trans.setDefaultName(`RECEIVE ${topicName}`);
  trans.type = 'messaging';

  const serviceContext = {
    origin: {
      name: topicName,
      id: topicArn,
    },
  };
  trans.setServiceContext(serviceContext);

  const cloudContext = {
    origin: {
      provider: 'aws',
      region,
      service: {
        name: 'sns',
      },
      account: {
        id: accountId,
      },
    },
  };
  trans.setCloudContext(cloudContext);

  const links = spanLinksFromSnsRecords(event.Records);
  trans._addLinks(links);
}

function setS3SingleData(trans, event, context, faasId, isColdStart) {
  const record = event.Records[0];

  trans.setFaas(
    getFaasData(
      context,
      faasId,
      isColdStart,
      'datasource',
      record.responseElements && record.responseElements['x-amz-request-id'],
    ),
  );

  trans.setDefaultName(
    `${record && record.eventName} ${
      record && record.s3 && record.s3.bucket && record.s3.bucket.name
    }`,
  );
  trans.type = 'request';

  const serviceContext = {
    origin: {
      name: record && record.s3 && record.s3.bucket && record.s3.bucket.name,
      id: record && record.s3 && record.s3.bucket && record.s3.bucket.arn,
      version: record.eventVersion,
    },
  };
  trans.setServiceContext(serviceContext);

  const cloudContext = {
    origin: {
      provider: 'aws',
      service: {
        name: 's3',
      },
      region: record.awsRegion,
    },
  };
  trans.setCloudContext(cloudContext);
}

function elasticApmAwsLambda(agent) {
  const log = agent.logger;
  const ins = agent._instrumentation;

  /**
   * Register this transaction with the Lambda extension, if possible.  This
   * function is `await`able so that the transaction is registered before
   * executing the user's Lambda handler.
   *
   * Perf note: Using a Lambda sized to have 1 vCPU (1769MB memory), some
   * rudimentary perf tests showed an average of 0.8ms for this call to the ext.
   */
  function registerTransaction(trans, awsRequestId) {
    if (!agent._apmClient) {
      return;
    }
    if (!agent._apmClient.lambdaShouldRegisterTransactions()) {
      return;
    }

    // Reproduce the filtering logic from `Instrumentation.prototype.addEndedTransaction`.
    if (agent._conf.contextPropagationOnly) {
      return;
    }
    if (
      !trans.sampled &&
      !agent._apmClient.supportsKeepingUnsampledTransaction()
    ) {
      return;
    }

    var payload = trans.toJSON();
    // If this partial transaction is used, the Lambda Extension will fill in:
    // - `transaction.result` will be set to one of:
    //    - The "status" field from the Logs API platform `runtimeDone` message.
    //      https://docs.aws.amazon.com/lambda/latest/dg/runtimes-logs-api.html#runtimes-logs-api-ref-done
    //      Values: "success", "failure"
    //    - The "shutdownReason" field from the `Shutdown` event from the Extensions API.
    //      https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html#runtimes-lifecycle-shutdown
    //      Values: "spindown", "timeout", "failure"   (I think these are the values.)
    // - `transaction.outcome` will be set to "failure" if the status above is
    //   not "success". Therefore we want a default outcome value.
    // - `transaction.duration` will be estimated
    delete payload.result;
    delete payload.duration;

    payload = agent._transactionFilters.process(payload);
    if (!payload) {
      log.trace(
        { traceId: trans.traceId, transactionId: trans.id },
        'transaction ignored by filter',
      );
      return;
    }

    return agent._apmClient.lambdaRegisterTransaction(payload, awsRequestId);
  }

  function endAndFlushTransaction(
    err,
    result,
    trans,
    event,
    context,
    triggerType,
    cb,
  ) {
    log.trace(
      { awsRequestId: context && context.awsRequestId },
      'lambda: fn end',
    );

    switch (triggerType) {
      case TRIGGER_API_GATEWAY:
        setTransDataFromApiGatewayResult(err, result, trans, event);
        break;
      case TRIGGER_ELB:
        setTransDataFromElbResult(err, result, trans);
        break;
      default:
        if (err) {
          trans.result = constants.RESULT_FAILURE;
          trans.setOutcome(constants.OUTCOME_FAILURE);
        } else {
          trans.result = constants.RESULT_SUCCESS;
          trans.setOutcome(constants.OUTCOME_SUCCESS);
        }
        break;
    }

    if (err) {
      // Capture the error before trans.end() so it associates with the
      // current trans.  `skipOutcome` to avoid setting outcome on a possible
      // currentSpan, because this error applies to the transaction, not any
      // sub-span.
      agent.captureError(err, { skipOutcome: true });
    }

    trans.end();

    agent._flush({ lambdaEnd: true, inflightTimeout: 100 }, (flushErr) => {
      if (flushErr) {
        log.error(
          { err: flushErr, awsRequestId: context && context.awsRequestId },
          'lambda: flush error',
        );
      }
      log.trace(
        { awsRequestId: context && context.awsRequestId },
        'lambda: wrapper end',
      );
      cb();
    });
  }

  function wrapContext(runContext, trans, event, context, triggerType) {
    shimmer.wrap(context, 'succeed', (origSucceed) => {
      return ins.bindFunctionToRunContext(
        runContext,
        function wrappedSucceed(result) {
          endAndFlushTransaction(
            null,
            result,
            trans,
            event,
            context,
            triggerType,
            function () {
              origSucceed(result);
            },
          );
        },
      );
    });

    shimmer.wrap(context, 'fail', (origFail) => {
      return ins.bindFunctionToRunContext(
        runContext,
        function wrappedFail(err) {
          endAndFlushTransaction(
            err,
            null,
            trans,
            event,
            context,
            triggerType,
            function () {
              origFail(err);
            },
          );
        },
      );
    });

    shimmer.wrap(context, 'done', (origDone) => {
      return wrapLambdaCallback(
        runContext,
        trans,
        event,
        context,
        triggerType,
        origDone,
      );
    });
  }

  function wrapLambdaCallback(
    runContext,
    trans,
    event,
    context,
    triggerType,
    callback,
  ) {
    return ins.bindFunctionToRunContext(
      runContext,
      function wrappedLambdaCallback(err, result) {
        endAndFlushTransaction(
          err,
          result,
          trans,
          event,
          context,
          triggerType,
          () => {
            callback(err, result);
          },
        );
      },
    );
  }

  return function wrapLambdaHandler(type, fn) {
    if (typeof type === 'function') {
      fn = type;
      type = 'request';
    }
    if (!agent._conf.active) {
      // Manual usage of `apm.lambda(...)` should be a no-op when not active.
      return fn;
    }

    return async function wrappedLambdaHandler(event, context, callback) {
      if (!(event && context && typeof callback === 'function')) {
        // Skip instrumentation if arguments are unexpected.
        // https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html
        return fn.call(this, ...arguments);
      }
      log.trace({ awsRequestId: context.awsRequestId }, 'lambda: fn start');

      const isColdStart = isFirstRun;
      if (isFirstRun) {
        isFirstRun = false;

        // E.g. 'arn:aws:lambda:us-west-2:123456789012:function:my-function:someAlias'
        const arnParts = context.invokedFunctionArn.split(':');
        gFaasId = arnParts.slice(0, 7).join(':');
        const cloudAccountId = arnParts[4];

        if (agent._apmClient) {
          log.trace(
            { awsRequestId: context.awsRequestId },
            'lambda: setExtraMetadata',
          );
          agent._apmClient.setExtraMetadata(getMetadata(agent, cloudAccountId));
        }
      }

      if (agent._apmClient) {
        agent._apmClient.lambdaStart();
      }

      const triggerType = triggerTypeFromEvent(event);

      // Look for trace-context info in headers or messageAttributes.
      let traceparent;
      let tracestate;
      if (
        (triggerType === TRIGGER_API_GATEWAY || triggerType === TRIGGER_ELB) &&
        event.headers
      ) {
        // https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html
        // says "Header names are lowercased." However, that isn't the case for
        // payload format version 1.0. We need lowercased headers for processing.
        if (!event.requestContext.http) {
          // 1.0
          event.normedHeaders = lowerCaseObjectKeys(event.headers);
        } else {
          event.normedHeaders = event.headers;
        }
        traceparent =
          event.normedHeaders.traceparent ||
          event.normedHeaders['elastic-apm-traceparent'];
        tracestate = event.normedHeaders.tracestate;
      }

      // Start the transaction and set some possibly trigger-specific data.
      const trans = agent.startTransaction(context.functionName, type, {
        childOf: traceparent,
        tracestate,
      });
      switch (triggerType) {
        case TRIGGER_API_GATEWAY:
          setApiGatewayData(agent, trans, event, context, gFaasId, isColdStart);
          break;
        case TRIGGER_ELB:
          setElbData(agent, trans, event, context, gFaasId, isColdStart);
          break;
        case TRIGGER_SQS:
          setSqsData(agent, trans, event, context, gFaasId, isColdStart);
          break;
        case TRIGGER_SNS:
          setSnsData(agent, trans, event, context, gFaasId, isColdStart);
          break;
        case TRIGGER_S3_SINGLE_EVENT:
          setS3SingleData(trans, event, context, gFaasId, isColdStart);
          break;
        case TRIGGER_GENERIC:
          setGenericData(trans, event, context, gFaasId, isColdStart);
          break;
        default:
          log.warn(
            `not setting transaction data for triggerType=${triggerType}`,
          );
      }

      // Wrap context and callback to finish and send transaction.
      // Note: Wrapping context needs to happen *before any `await` calls* in
      // this function, otherwise the Lambda Node.js Runtime will call the
      // *unwrapped* `context.{succeed,fail,done}()` methods.
      const transRunContext = ins.currRunContext();
      wrapContext(transRunContext, trans, event, context, triggerType);
      const wrappedCallback = wrapLambdaCallback(
        transRunContext,
        trans,
        event,
        context,
        triggerType,
        callback,
      );

      await registerTransaction(trans, context.awsRequestId);

      try {
        const retval = ins.withRunContext(
          transRunContext,
          fn,
          this,
          event,
          context,
          wrappedCallback,
        );
        if (retval instanceof Promise) {
          return retval;
        } else {
          // In this case, our wrapping of the user's handler has changed it
          // from a sync function to an async function. We need to ensure the
          // Lambda Runtime does not end the invocation based on this returned
          // promise -- the invocation should end when the `callback` is called
          // -- so we return a promise that never resolves.
          return new Promise((resolve, reject) => {
            /* never resolves */
          });
        }
      } catch (handlerErr) {
        wrappedCallback(handlerErr);
        // Return a promise that never resolves, so that the Lambda Runtime's
        // doesn't attempt its "success" handling.
        return new Promise((resolve, reject) => {
          /* never resolves */
        });
      }
    };
  };
}

function isLambdaExecutionEnvironment() {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function isHandlerNameInModules(handlerModule, modules) {
  for (let instrumentedModules of modules) {
    // array.flat didn't come around until Node 11
    if (!Array.isArray(instrumentedModules)) {
      instrumentedModules = [instrumentedModules];
    }
    for (const instrumentedModule of instrumentedModules) {
      if (handlerModule === instrumentedModule) {
        return true;
      }
    }
  }
  return false;
}

// Returns the full file path to the user's handler handler module
//
// The Lambda Runtime allows a user's handler module to have either a .js or
// .cjs extension.  The getFilePath looks for a .js file first, and if not found
// presumes a csj file exists. If neither file exists this means the user either
// as a misconfigured handler (they'd never reach this code) or is using a
// .mjs file extension (which indicates an ECMAScript/import module, which the
// agent does not support.
//
// @param string taskRoot
// @param string handlerModule
// @return string
function getFilePath(taskRoot, handlerModule) {
  let filePath = path.resolve(taskRoot, `${handlerModule}.js`);
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(taskRoot, `${handlerModule}.cjs`);
  }
  return filePath;
}

function getLambdaHandlerInfo(env, modules, logger) {
  if (
    !isLambdaExecutionEnvironment() ||
    !env._HANDLER ||
    !env.LAMBDA_TASK_ROOT
  ) {
    return;
  }

  // extract module name and "path" from handler using the same regex as the runtime
  // from https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/c31c41ffe5f2f03ae9e8589b96f3b005e2bb8a4a/src/utils/UserFunction.ts#L21
  const functionExpression = /^([^.]*)\.(.*)$/;
  const match = env._HANDLER.match(functionExpression);
  if (!match || match.length !== 3) {
    return;
  }
  const handlerModule = match[1].split('/').pop();
  const handlerFunctionPath = match[2];

  // if there's a name conflict with an already instrumented module, skip the
  // instrumentation of the lambda handle and log a message.
  if (isHandlerNameInModules(handlerModule, modules)) {
    logger.warn(
      'Unable to instrument Lambda handler "%s" due to name conflict with "%s", please choose a different Lambda handler name',
      env._HANDLER,
      handlerModule,
    );
    return;
  }

  const handlerFilePath = getFilePath(env.LAMBDA_TASK_ROOT, match[1]);

  return {
    filePath: handlerFilePath,
    module: handlerModule,
    field: handlerFunctionPath,
  };
}

function lowerCaseObjectKeys(obj) {
  const lowerCased = {};
  for (const key of Object.keys(obj)) {
    lowerCased[key.toLowerCase()] = obj[key];
  }
  return lowerCased;
}

// Extract span links from up to 1000 messages in this batch.
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
//
// A span link is created from a `traceparent` message attribute in a message.
// `msg.messageAttributes` is of the form:
//    { <attribute-name>: { DataType: <attr-type>, StringValue: <attr-value>, ... } }
// For example:
//    { traceparent: { DataType: 'String', StringValue: 'test-traceparent' } }
function spanLinksFromSqsRecords(records) {
  const links = [];
  const limit = Math.min(
    records.length,
    MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
  );
  for (let i = 0; i < limit; i++) {
    const attrs = records[i].messageAttributes;
    if (!attrs) {
      continue;
    }

    let traceparent;
    const attrNames = Object.keys(attrs);
    for (let j = 0; j < attrNames.length; j++) {
      const attrVal = attrs[attrNames[j]];
      if (attrVal.dataType !== 'String') {
        continue;
      }
      const attrNameLc = attrNames[j].toLowerCase();
      if (attrNameLc === 'traceparent') {
        traceparent = attrVal.stringValue;
        break;
      }
    }
    if (traceparent) {
      links.push({ context: traceparent });
    }
  }
  return links;
}

// Extract span links from up to 1000 messages in this batch.
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-messaging.md#receiving-trace-context
//
// A span link is created from a `traceparent` message attribute in a message.
// `record.Sns.MessageAttributes` is of the form:
//    { <attribute-name>: { Type: <attr-type>, Value: <attr-value> } }
// For example:
//    { traceparent: { Type: 'String', Value: 'test-traceparent' } }
function spanLinksFromSnsRecords(records) {
  const links = [];
  const limit = Math.min(
    records.length,
    MAX_MESSAGES_PROCESSED_FOR_TRACE_CONTEXT,
  );
  for (let i = 0; i < limit; i++) {
    const attrs = records[i].Sns && records[i].Sns.MessageAttributes;
    if (!attrs) {
      continue;
    }

    let traceparent;
    const attrNames = Object.keys(attrs);
    for (let j = 0; j < attrNames.length; j++) {
      const attrVal = attrs[attrNames[j]];
      if (attrVal.Type !== 'String') {
        continue;
      }
      const attrNameLc = attrNames[j].toLowerCase();
      if (attrNameLc === 'traceparent') {
        traceparent = attrVal.Value;
        break;
      }
    }
    if (traceparent) {
      links.push({ context: traceparent });
    }
  }
  return links;
}

module.exports = {
  isLambdaExecutionEnvironment,
  elasticApmAwsLambda,
  getLambdaHandlerInfo,
};
