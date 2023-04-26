/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const constants = require('../../../constants')

const TYPE = 'storage'
const SUBTYPE = 's3'
const elasticAPMStash = Symbol('elasticAPMStash')
const COMMAND_NAME_RE = /^(\w+)Command$/

/**
 * TODO: this method may be shared with other instrumentations
 * For a HeadObject API call, `context.commandName === 'HeadObjectCommand'`.
 *
 * @param {String} commandName
 * @returns {String}
 */
function opNameFromCommandName (commandName) {
  const match = COMMAND_NAME_RE.exec(commandName)
  if (match) {
    return match[1]
  } else {
    return '<unknown command>'
  }
}

/**
 * Gets the region from the ARN
 *
 * @param {String} s3Arn
 * @returns {String}
 */
function regionFromS3Arn (s3Arn) {
  return s3Arn.split(':')[3]
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
 * @returns {String}
 */
function resourceFromBucket (bucket) {
  let resource = null
  if (bucket) {
    resource = bucket
    if (resource.startsWith('arn:')) {
      resource = bucket.split(':').slice(5).join(':')
    }
  }
  return resource
}

/**
 * We do alias them to a local type
 * @typedef {import('@aws-sdk/types').InitializeMiddleware} InitalizeMiddleware
 * @typedef {import('@aws-sdk/types').FinalizeRequestMiddleware } FinalizeRequestMiddleware
 * @typedef {import('@aws-sdk/types').InitializeHandlerOptions} InitializeHandlerOptions
 * @typedef {import('@aws-sdk/types').FinalizeRequestHandlerOptions } FinalizeRequestHandlerOptions
 *
 * Then create our types
 * @typedef {InitalizeMiddleware | FinalizeRequestMiddleware} S3Middleware
 * @typedef {InitializeHandlerOptions | FinalizeRequestHandlerOptions} S3MiddlewareOptions

 * @typedef {object} S3MiddlewareEntry
 * @property {S3Middleware} middleware
 * @property {import('@aws-sdk/types').HandlerOptions} options
 */
/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-s3').S3Client} client
 * @param {any} agent
 * @returns {S3MiddlewareEntry[]}
 */
function createMiddlewaresForS3Client (client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        const opName = opNameFromCommandName(context.commandName)
        const resource = resourceFromBucket(args.input.Bucket)
        const name = resource ? `S3 ${opName} ${resource}` : `S3 ${opName}`
        const span = agent.startSpan(name, TYPE, SUBTYPE, opName)

        let err
        let result
        try {
          result = await next(args)
        } catch (ex) {
          // Save the error for use in `finally` below, but re-throw it to
          // not impact code flow.
          err = ex
          throw ex
        } finally {
          if (span) {
            let statusCode
            if (result && result.response) {
              statusCode = result.response.statusCode
            } else if (err && err.$metadata && err.$metadata.httpStatusCode) {
              // This code path happens with a GetObject conditional request
              // that returns a 304 Not Modified.
              statusCode = err.$metadata.httpStatusCode
            }
            if (statusCode) {
              span._setOutcomeFromHttpStatusCode(statusCode)
            } else {
              span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
            }
            if (err && (!statusCode || statusCode >= 400)) {
              agent.captureError(err, { skipOutcome: true })
            }

            // Configuring `new S3Client({useArnRegion:true})` allows one to
            // use an Access Point bucket ARN for a region *other* than the
            // one for which the client is configured. Therefore, we attempt
            // to get the bucket region from the ARN first.
            const useArnRegion = await client.config.useArnRegion()
            const region = useArnRegion && args.input.Bucket.startsWith('arn:')
              ? regionFromS3Arn(args.input.Bucket)
              : await client.config.region()

            // Destination context.
            let port = context[elasticAPMStash].port
            if (port === undefined) {
              if (context[elasticAPMStash].protocol === 'https:') {
                port = 443
              } else if (context[elasticAPMStash].protocol === 'http:') {
                port = 80
              }
            }
            const destContext = {
              address: context[elasticAPMStash].hostname,
              port: port,
              service: {
                name: SUBTYPE,
                type: TYPE
              }
            }
            if (resource) {
              destContext.service.resource = resource
            }

            if (region) {
              destContext.cloud = { region }
            }
            span._setDestinationContext(destContext)

            span.end()
          }
        }

        return result
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' }
    },
    {
      middleware: (next, context) => async (args) => {
        context[elasticAPMStash] = {
          hostname: args.request.hostname,
          port: args.request.port,
          protocol: args.request.protocol
        }
        return await next(args)
      },
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' }
    }
  ]
}

module.exports = {
  createMiddlewaresForS3Client
}
