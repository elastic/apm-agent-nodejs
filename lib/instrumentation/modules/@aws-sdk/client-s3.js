/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('../../../constants');
const NAME = 'S3';
const TYPE = 'storage';
const SUBTYPE = 's3';
const elasticAPMStash = Symbol('elasticAPMStash');

/**
 * Gets the region from the ARN
 *
 * @param {String} s3Arn
 * @returns {String}
 */
function regionFromS3Arn(s3Arn) {
  return s3Arn.split(':')[3];
}

/**
 * Return an APM "resource" string for the bucket, Access Point ARN, or Outpost
 * ARN. ARNs are normalized to a shorter resource name.
 * Known ARN patterns:
 * - arn:aws:s3:<region>:<account-id>:accesspoint/<accesspoint-name>
 * - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/bucket/<bucket-name>
 * - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/accesspoint/<accesspoint-name>
 *
 * In general that is:
 *    arn:$partition:$service:$region:$accountId:$resource
 *
 * This parses using the same "split on colon" used by the JavaScript AWS SDK v3.
 * https://github.com/aws/aws-sdk-js-v3/blob/v3.18.0/packages/util-arn-parser/src/index.ts#L14-L37
 *
 * @param {String} bucket The bucket string
 * @returns {String | null}
 */
function resourceFromBucket(bucket) {
  let resource = null;
  if (bucket) {
    resource = bucket;
    if (resource.startsWith('arn:')) {
      resource = bucket.split(':').slice(5).join(':');
    }
  }
  return resource;
}

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-s3').S3Client} client
 * @param {any} agent
 * @returns {import('./smithy-client').AWSMiddlewareEntry[]}
 */
function s3MiddlewareFactory(client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        // Ensure there is a span from the wrapped `client.send()`.
        const span = agent._instrumentation.currSpan();
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args);
        }

        const input = args.input;
        const bucket = input && input.Bucket;
        const resource = resourceFromBucket(bucket);
        // The given span comes with the operation name and we need to
        // add the resource if applies
        if (resource) {
          span.name += ' ' + resource;
          span.setServiceTarget('s3', resource);
        }

        // As for now OTel spec defines attributes for operations that require a Bucket
        // if that changes we should review this guard
        // https://github.com/open-telemetry/opentelemetry-specification/blob/v1.20.0/semantic_conventions/trace/instrumentation/aws-sdk.yml#L435
        if (bucket) {
          const otelAttrs = span._getOTelAttributes();

          otelAttrs['aws.s3.bucket'] = bucket;

          if (input.Key) {
            otelAttrs['aws.s3.key'] = input.Key;
          }
        }

        let err;
        let result;
        let response;
        let statusCode;
        try {
          result = await next(args);
          response = result && result.response;
          statusCode = response && response.statusCode;
        } catch (ex) {
          // Save the error for use in `finally` below, but re-throw it to
          // not impact code flow.
          err = ex;

          // This code path happens with a GetObject conditional request
          // that returns a 304 Not Modified.
          statusCode = err && err.$metadata && err.$metadata.httpStatusCode;
          throw ex;
        } finally {
          if (statusCode) {
            span._setOutcomeFromHttpStatusCode(statusCode);
          } else {
            span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE);
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true });
          }

          // Set the httpContext
          if (statusCode) {
            const httpContext = {
              status_code: statusCode,
            };

            if (
              response &&
              response.headers &&
              response.headers['content-length']
            ) {
              const encodedBodySize = Number(
                response.headers['content-length'],
              );
              if (!isNaN(encodedBodySize)) {
                httpContext.response = { encoded_body_size: encodedBodySize };
              }
            }
            span.setHttpContext(httpContext);
          }

          // Configuring `new S3Client({useArnRegion:true})` allows one to
          // use an Access Point bucket ARN for a region *other* than the
          // one for which the client is configured. Therefore, we attempt
          // to get the bucket region from the ARN first.
          const config = client.config;
          let useArnRegion;
          if (typeof config.useArnRegion === 'boolean') {
            useArnRegion = config.useArnRegion;
          } else {
            useArnRegion = await config.useArnRegion();
          }

          let region;
          if (useArnRegion && bucket && bucket.startsWith('arn:')) {
            region = regionFromS3Arn(args.input.Bucket);
          } else {
            region =
              typeof config.region === 'boolean'
                ? region
                : await config.region();
          }

          // Destination context.
          const destContext = {
            service: {
              name: SUBTYPE,
              type: TYPE,
            },
          };
          if (context[elasticAPMStash]) {
            destContext.address = context[elasticAPMStash].hostname;
            destContext.port = context[elasticAPMStash].port;
          }
          if (resource) {
            destContext.service.resource = resource;
          }
          if (region) {
            destContext.cloud = { region };
          }
          span._setDestinationContext(destContext);

          span.end();
        }

        return result;
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' },
    },
    {
      middleware: (next, context) => async (args) => {
        const req = args.request;
        let port = req.port;

        // Resolve port for HTTP(S) protocols
        if (port === undefined) {
          if (req.protocol === 'https:') {
            port = 443;
          } else if (req.protocol === 'http:') {
            port = 80;
          }
        }

        context[elasticAPMStash] = {
          hostname: req.hostname,
          port,
        };
        return next(args);
      },
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' },
    },
  ];
}

module.exports = {
  S3_NAME: NAME,
  S3_TYPE: TYPE,
  S3_SUBTYPE: SUBTYPE,
  s3MiddlewareFactory,
};
