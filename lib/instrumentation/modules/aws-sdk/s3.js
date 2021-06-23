'use strict'

// Instrument AWS S3 operations via the 'aws-sdk' package.

const constants = require('../../../constants')

const TYPE = 'storage'
const SUBTYPE = 's3'

// Return the PascalCase operation name from `request.operation` by undoing to
// `lowerFirst()` from
// https://github.com/aws/aws-sdk-js/blob/c0c44b8a4e607aae521686898f39a3e359f727e4/lib/model/api.js#L63-L65
//
// For example: 'headBucket' -> 'HeadBucket'
function opNameFromOperation (operation) {
  return operation[0].toUpperCase() + operation.slice(1)
}

// Return an APM "resource" string for the bucket, Access Point ARN, or Outpost
// ARN. ARNs are normalized to a shorter resource name.
//
// Known ARN patterns:
// - arn:aws:s3:<region>:<account-id>:accesspoint/<accesspoint-name>
// - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/bucket/<bucket-name>
// - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/accesspoint/<accesspoint-name>
//
// In general that is:
//    arn:$partition:$service:$region:$accountId:$resource
//
// This parses using the same "split on colon" used by the JavaScript AWS SDK v3.
// https://github.com/aws/aws-sdk-js-v3/blob/v3.18.0/packages/util-arn-parser/src/index.ts#L14-L37
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

// Instrument an awk-sdk@2.x operation (i.e. a AWS.Request.send or
// AWS.Request.promise).
//
// @param {AWS.Request} request https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Request.html
function instrumentationS3 (orig, origArguments, request, AWS, agent, { version, enabled }) {
  const opName = opNameFromOperation(request.operation)
  let name = 'S3 ' + opName
  const resource = resourceFromBucket(request.params && request.params.Bucket)
  if (resource) {
    name += ' ' + resource
  }

  const span = agent.startSpan(name, TYPE, SUBTYPE, opName)
  if (span) {
    request.on('complete', function onComplete (response) {
      // `response` is an AWS.Response
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Response.html

      // Determining the bucket's region.
      // `request.httpRequest.region` isn't documented, but the aws-sdk@2
      // lib/services/s3.js will set it to the bucket's determined region.
      // This can be asynchronously determined -- e.g. if it differs from the
      // configured service endpoint region -- so this won't be set until
      // 'complete'.
      const region = request.httpRequest && request.httpRequest.region

      // Destination context.
      // '.httpRequest.endpoint' might differ from '.service.endpoint' if
      // the bucket is in a different region.
      const endpoint = request.httpRequest && request.httpRequest.endpoint
      const destContext = {
        service: {
          name: SUBTYPE,
          type: TYPE
        }
      }
      if (endpoint) {
        destContext.address = endpoint.hostname
        destContext.port = endpoint.port
      }
      if (resource) {
        destContext.service.resource = resource
      }
      if (region) {
        destContext.cloud = { region }
      }
      span.setDestinationContext(destContext)

      if (response) {
        // Follow the spec for HTTP client span outcome.
        // https://github.com/elastic/apm/blob/master/specs/agents/tracing-instrumentation-http.md#outcome
        //
        // For example, a S3 GetObject conditional request (e.g. using the
        // IfNoneMatch param) will respond with response.error=NotModifed and
        // statusCode=304. This is a *successful* outcome.
        const statusCode = response.httpResponse && response.httpResponse.statusCode
        if (statusCode) {
          span._setOutcomeFromHttpStatusCode(statusCode)
        } else {
          // `statusCode` will be undefined for errors before sending a request, e.g.:
          //  InvalidConfiguration: Custom endpoint is not compatible with access point ARN
          span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
        }

        if (response.error && (!statusCode || statusCode >= 400)) {
          agent.captureError(response.error, { skipOutcome: true })
        }
      }

      // Workaround a bug in the agent's handling of `span.sync`.
      //
      // The bug: Currently this span.sync is not set `false` because there is
      // an HTTP span created (for this S3 request) in the same async op. That
      // HTTP span becomes the "active span" for this async op, and *it* gets
      // marked as sync=false in `before()` in async-hooks.js.
      span.sync = false

      span.end()
    })
  }

  return orig.apply(request, origArguments)
}

module.exports = {
  instrumentationS3
}
