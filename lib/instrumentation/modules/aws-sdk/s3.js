'use strict'

// Instrument AWS S3 operations via the 'aws-sdk' package.

const constants = require('../../../constants')

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
  // console.warn('XXX endpoint: ', request.service.endpoint)
  // console.warn('XXX service.config before: ', request.service.config)

  // XXX action is 'listBuckets' from the SDK. Our spec is 'ListBuckets'. Is a
  // simple string.capitalize sufficient? TODO: Find a aws-sdk-js-v3 ref for that.
  const action = request.operation[0].toUpperCase() + request.operation.slice(1)
  let name = 'S3 ' + action
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

  const span = agent.startSpan(name, TYPE, SUBTYPE, action)
  if (span) {
    // Determining the bucket region is not always possible.
    // - `request.service.config.region` can be "us-west-2" and talk to a bucket
    //   in "us-west-1"
    // - `request.service.endpoint` can be to a regional endpoint, e.g.
    //   "https://s3.us-east-2.amazonaws.com", to access a bucket hosted in a
    //   different region.
    // - The `x-amz-bucket-region` response header is set for HeadBucket calls.
    // - A separate API call to GetBucketLocation will return the
    //   "LocationConstraint" specified at CreateBucket. API docs
    //   (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getBucketLocation-property)
    //   state "Buckets in Region us-east-1 have a LocationConstraint of null."
    //   though the empty string has been observed.
    // - If there is a `response.error` set, it sometimes has a 'region' prop.
    // const region = null // XXX

    // XXX context.db is pending discussion
    // span.setDbContext({
    //   type: 's3'
    //   // instance: region  // XXX see above
    // })

    // Destination context.
    const endpoint = request.service.endpoint
    const destContext = {
      address: endpoint.hostname,
      port: endpoint.port,
      service: {
        name: 's3',
        type: 'storage'
      }
    }
    if (resource) {
      destContext.service.resource = resource
    }
    // TODO: destination.cloud.region is pending https://github.com/elastic/ecs/issues/1282
    span.setDestinationContext(destContext)

    request.on('complete', function (response) {
      // console.warn('XXX response: ', response)
      // console.warn('XXX response info: ',
      //   'retryCount', response.retryCount,
      //   'redirectCount', response.redirectCount,
      //   'statusCode', response.httpResponse.statusCode,
      //   'headers', response.httpResponse.headers
      // )
      if (response && response.error) {
        console.warn('XXX response.error ', response.error)
        // XXX is skipOutcome necessary for S3 error responses?
        const errOpts = {
          skipOutcome: true
        }
        agent.captureError(response.error, errOpts)
        span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
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

  const origResult = orig.apply(request, origArguments)

  return origResult
}

module.exports = {
  instrumentationS3
}
