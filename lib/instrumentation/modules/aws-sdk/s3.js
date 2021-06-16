'use strict'

// Instrument AWS S3 operations via the 'aws-sdk' package.

const TYPE = 'storage'
const SUBTYPE = 's3'

// This regex adapted from "OutpostArn" pattern at
// https://docs.aws.amazon.com/outposts/latest/APIReference/API_Outpost.html
const ARN_REGEX = /^arn:aws([a-z-]+)?:(s3|s3-outposts):[a-z\d-]+:\d{12}:(.*?)$/

// Instrument an awk-sdk@2.x operation (i.e. a AWS.Request.send or
// AWS.Request.promise).
//
// @param {AWS.Request} request https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Request.html
function instrumentationS3 (orig, origArguments, request, AWS, agent, { version, enabled }) {
  // Get the PascalCase operation name from `request.operation` by undoing to
  // `lowerFirst()` from
  // https://github.com/aws/aws-sdk-js/blob/c0c44b8a4e607aae521686898f39a3e359f727e4/lib/model/api.js#L63-L65
  const opName = request.operation[0].toUpperCase() + request.operation.slice(1)
  let name = 'S3 ' + opName
  let resource = null // The bucket name or normalized Access Point/Outpost ARN.
  if (request.params && request.params.Bucket) {
    resource = request.params.Bucket
    if (resource.startsWith('arn:')) {
      // This is an Access Point or Outpost ARN, e.g.:
      // - arn:aws:s3:region:account-id:accesspoint/resource
      // - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/bucket/<bucket-name>
      // - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/accesspoint/<accesspoint-name></accesspoint-name>
      const match = ARN_REGEX.exec(resource)
      if (match) {
        resource = match[3]
      }
    }
    name += ' ' + resource
  }

  const span = agent.startSpan(name, TYPE, SUBTYPE, opName)
  if (span) {
    request.on('complete', function onComplete (response) {
      // `response` is an AWS.Response
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Response.html

      // Determining the bucket's region.
      // `request.httpRequest.region` isn't documented, but the aws-sdk@2
      // lib/services/s3.js will often set it to the bucket's determined region.
      // This can be asynchronously determined -- e.g. if it differs from the
      // configured service endpoint region -- so this won't be set until
      // 'complete'.
      const region = request.httpRequest.region

      // Destination context.
      // '.httpRequest.endpoint' might differ from '.service.endpoint' if
      // the bucket is in a different region.
      const endpoint = request.httpRequest.endpoint
      const destContext = {
        address: endpoint.hostname,
        port: endpoint.port,
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
      span.setDestinationContext(destContext)

      // XXX I think the following onComplete handling could be shared for all AWS instrumentations

      if (response) { // insanity guard
        // Follow the spec for HTTP client span outcome.
        // https://github.com/elastic/apm/blob/master/specs/agents/tracing-instrumentation-http.md#outcome
        //
        // For example, a S3 GetObject conditional request (e.g. using the
        // IfNoneMatch param) will respond with response.error=NotModifed and
        // statusCode=304. This is a *successful* outcome.
        const statusCode = response.httpResponse.statusCode
        span._setOutcomeFromHttpStatusCode(statusCode)

        if (response.error && statusCode && statusCode >= 400) {
          // `skipOutcome` because (a) we have set it manually per the
          // statusCode, and (b) `captureError` uses `this.currentSpan` which
          // currently *gets the wrong span* -- it gets the HTTP span created
          // in the same async op for the underlying HTTP request to the AWS
          // endpoint.
          agent.captureError(response.error, { skipOutcome: true })
        }
      }

      // Workaround a bug in the agent's handling of `span.sync`.
      //
      // The bug: Currently this span.sync is not set `false` because there is
      // an HTTP span created (for this S3 request) in the same async op. That
      // HTTP span becomes the "active span" for this async op, and *it* gets
      // marked as sync=false in `before()` in async-hooks.js.
      // TODO: move this to a separate issue.
      span.sync = false

      span.end()
    })
  }

  return orig.apply(request, origArguments)
}

module.exports = {
  instrumentationS3
}
