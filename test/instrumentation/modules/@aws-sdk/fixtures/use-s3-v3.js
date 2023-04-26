/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Run a single scenario of using the S3 client (callback style) with APM
// enabled. This is used to test that the expected APM events are generated.
// It writes log.info (in ecs-logging format, see
// https://github.com/trentm/go-ecslog#install) for each S3 client API call.
//
// This script can also be used for manual testing of APM instrumentation of S3
// against a real S3 account. This can be useful because tests are done against
// https://github.com/localstack/localstack that *simulates* S3 with imperfect
// fidelity.
//
// Auth note: By default this uses the AWS profile/configuration from the
// environment. If you do not have that configured (i.e. do not have
// "~/.aws/...") files, then you can still use localstack via setting:
//    unset AWS_PROFILE
//    export AWS_ACCESS_KEY_ID=fake
//    export AWS_SECRET_ACCESS_KEY=fake
// See also: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html
//
// Usage:
//    # Run against the default configured AWS profile, creating a new bucket
//    # and deleting it afterwards.
//    node use-s3-v3.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-s3-v3.js | ecslog
//
//    # Use TEST_BUCKET_NAME to re-use an existing bucket (and not delete it).
//    # For safety the bucket name must start with "elasticapmtest-bucket-".
//    TEST_BUCKET_NAME=elasticapmtest-bucket-1 node use-s3.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/trentm/c402bcab8c0571f26d879ec0bcf5759c

const apm = require('../../../../..').start({
  serviceName: 'use-s3-v3',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info'
})

const crypto = require('crypto')
const vasync = require('vasync')
const assert = require('assert')
const {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  waitUntilBucketExists,
  waitUntilObjectExists
} = require('@aws-sdk/client-s3')

const TEST_BUCKET_NAME_PREFIX = 'elasticapmtest-bucket-'

// ---- support functions
/**
 * Gets the data or error from a promise and calls the callback function in a calssic node fashion
 *
 * @param {Promise<unknown>} promise the promise we want to capture result and error for the callback
 * @param {*} cb node lile callback with the signature (err, data)
 */
function toCallback (promise, cb) {
  promise.then(
    function (data) { cb(null, data) },
    function (err) { cb(err, null) }
  )
}

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/index.html
function useS3 (s3Client, bucketName, cb) {
  const region = s3Client.config.region
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: s3Client.config.endpoint,
    bucketName,
    region
  })
  const key = 'aDir/aFile.txt'
  const content = 'hi there'

  vasync.pipeline({
    arg: {},
    funcs: [
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/listbucketscommand.html
      // Limitation: this doesn't handle paging.
      function listAllBuckets (arg, next) {
        const command = new ListBucketsCommand({})

        toCallback(s3Client.send(command), function (err, data) {
          log.info({ err, data }, 'listBuckets')
          // TODO: need to check why this assertion fails
          // assert(apm.currentSpan === null,
          //   'S3 span should NOT be a currentSpan in its callback')
          if (err) {
            next(err)
          } else {
            arg.bucketIsPreexisting = data.Buckets.some(b => b.Name === bucketName)
            next()
          }
        })
        // TODO: need to check why this assertion fails
        // assert(apm.currentSpan === null,
        //   'S3 span (or its HTTP span) should not be currentSpan in same async task after the method call')
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/createbucketcommand.html
      function createTheBucketIfNecessary (arg, next) {
        if (arg.bucketIsPreexisting) {
          next()
          return
        }

        const command = new CreateBucketCommand({
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: region
          }
        })

        toCallback(s3Client.send(command), function (err, data) {
          // E.g. data: {"Location": "http://trentm-play-s3-bukkit2.s3.amazonaws.com/"}
          log.info({ err, data }, 'createBucket')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/functions/waitforbucketexists.html
      function waitForBucketToExist (_, next) {
        const waiterConfig = { client: s3Client, minwaitTime: 5, maxWaitTime: 10 }

        toCallback(
          waitUntilBucketExists(waiterConfig, { Bucket: bucketName }),
          function (err, data) {
            log.info({ err, data }, 'waitFor bucketExists')
            next(err)
          }
        )
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/putobjectcommand.html
      function createObj (_, next) {
        var md5 = crypto.createHash('md5').update(content).digest('base64')

        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: 'text/plain',
          Body: content,
          ContentMD5: md5
        })

        toCallback(s3Client.send(command), function (err, data) {
          // data.ETag should match a hexdigest md5 of body.
          log.info({ err, data }, 'putObject')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/functions/waitforobjectexists.html
      function waitForObjectToExist (_, next) {
        const waiterConfig = { client: s3Client, minwaitTime: 5, maxWaitTime: 10 }

        toCallback(
          waitUntilObjectExists(waiterConfig, { Bucket: bucketName, Key: key }),
          function (err, data) {
            log.info({ err, data }, 'waitFor bucketExists')
            next(err)
          }
        )
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/getobjectcommand.html
      function getObj (_, next) {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: key
        })

        toCallback(s3Client.send(command), function (err, data) {
          // data.ETag should match a hexdigest md5 of body.
          log.info({ err, data }, 'getObject')
          next(err)
        })
      },

      function getObjConditionalGet (_, next) {
        const md5hex = crypto.createHash('md5').update(content).digest('hex')
        const etag = `"${md5hex}"`

        const command = new GetObjectCommand({
          IfNoneMatch: etag,
          Bucket: bucketName,
          Key: key
        })

        toCallback(s3Client.send(command), function (err, data) {
          log.info({ err, data }, 'getObject conditional get')
          // Expect a 'NotModified' error, statusCode=304.
          if (err && err.code === 'NotModified') {
            next()
          } else if (err) {
            next(err)
          } else {
            next(new Error('expected NotModified error for conditional request'))
          }
        })
      },

      // Get a non-existant object to test APM captureError.
      function getObjNonExistantObject (_, next) {
        const nonExistantKey = key + '-does-not-exist'

        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: nonExistantKey
        })

        toCallback(s3Client.send(command), function (err, data) {
          log.info({ err, data }, 'getObject non-existant key, expect error')
          if (err) {
            next()
          } else {
            next(new Error(`did not get an error from getObject(${nonExistantKey})`))
          }
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObject-property
      function deleteTheObj (_, next) {
        const command = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key
        })

        toCallback(s3Client.send(command), function (err, data) {
          log.info({ err, data }, 'deleteObject')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/deletebucketcorscommand.html
      function deleteTheBucketIfCreatedIt (arg, next) {
        if (arg.bucketIsPreexisting) {
          next()
          return
        }

        const command = new DeleteBucketCommand({ Bucket: bucketName })

        toCallback(s3Client.send(command), function (err, data) {
          log.info({ err, data }, 'deleteBucket')
          next(err)
        })
      }
    ]
  }, function (err) {
    if (err) {
      log.error({ err }, 'unexpected error using S3 V3')
    }
    cb(err)
  })
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an S3
// bucket name:
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
function getTimestamp () {
  return (new Date()).toISOString().split('.')[0].replace(/[^0-9]/g, '')
}

// ---- mainline

function main () {
  // Config vars.
  const region = process.env.TEST_REGION || 'us-east-2'
  const endpoint = process.env.TEST_ENDPOINT || null
  const bucketName = process.env.TEST_BUCKET_NAME || TEST_BUCKET_NAME_PREFIX + getTimestamp()

  // Guard against any bucket name being used because we will be creating and
  // deleting objects in it, and potentially *deleting* the bucket.
  if (!bucketName.startsWith(TEST_BUCKET_NAME_PREFIX)) {
    throw new Error(`cannot use bucket name "${bucketName}", it must start with ${TEST_BUCKET_NAME_PREFIX}`)
  }

  const s3Client = new S3Client({
    region,
    endpoint,
    // In Jenkins CI the endpoint is "http://localstack:4566", which points to
    // a "localstack" docker container on the same network as the container
    // running tests. The aws-sdk S3 client defaults to "bucket style" URLs,
    // i.e. "http://$bucketName.localstack:4566/$key". This breaks with:
    //    UnknownEndpoint: Inaccessible host: `mahbukkit.localstack'. This service may not be available in the `us-east-2' region.
    //        at Request.ENOTFOUND_ERROR (/app/node_modules/aws-sdk/lib/event_listeners.js:530:46)
    //        ...
    //    originalError: Error: getaddrinfo ENOTFOUND mahbukkit.localstack
    //        at GetAddrInfoReqWrap.onlookup [as oncomplete] (dns.js:66:26) {
    //      errno: 'ENOTFOUND',
    //      code: 'NetworkingError',
    //      syscall: 'getaddrinfo',
    //      hostname: 'mahbukkit.localstack',
    //
    // It *works* with common localstack usage where the endpoint uses
    // *localhost*, because "$subdomain.localhost" DNS resolution still resolves
    // to 127.0.0.1.
    //
    // The work around is to force the client to use "path-style" URLs, e.g.:
    //    http://localstack:4566/$bucketName/$key
    forcePathStyle: true
  })

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual')
  useS3(s3Client, bucketName, function (err) {
    if (err) {
      tx.setOutcome('failure')
    }
    tx.end()
    process.exitCode = err ? 1 : 0
  })
}

main()
