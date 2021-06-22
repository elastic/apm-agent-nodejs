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
// Usage:
//    # Run against the default configured AWS profile, creating a new bucket
//    # and deleting it afterwards.
//    node use-s3-callback-style.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 -p 4571:4571 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-s3-callback-style.js | ecslog
//
//    # Use TEST_BUCKET_NAME to re-use an existing bucket (and not delete it).
//    # For safety the bucket name must start with "elasticapmtest-bucket-".
//    TEST_BUCKET_NAME=elasticapmtest-bucket-1 node use-s3-callback-style.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/trentm/c402bcab8c0571f26d879ec0bcf5759c

const apm = require('../../../../..').start({
  serviceName: 'use-s3-callback-style',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  captureSpanStackTraces: false,
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info'
})

const crypto = require('crypto')
const vasync = require('vasync')
const AWS = require('aws-sdk')

const TEST_BUCKET_NAME_PREFIX = 'elasticapmtest-bucket-'

// ---- support functions

// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html
function useS3 (s3Client, bucketName, cb) {
  const region = s3Client.config.region
  const log = apm.logger.child({ 'event.module': 'app', bucketName, region })
  const key = 'aDir/aFile.txt'
  const content = 'hi there'

  vasync.pipeline({
    arg: {},
    funcs: [
      // Limitation: this doesn't handle paging.
      function listAllBuckets (arg, next) {
        s3Client.listBuckets({}, function (err, data) {
          log.info({ err, data }, 'listBuckets')
          if (err) {
            next(err)
          } else {
            arg.bucketIsPreexisting = data.Buckets.some(b => b.Name === bucketName)
            next()
          }
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createBucket-property
      function createTheBucketIfNecessary (arg, next) {
        if (arg.bucketIsPreexisting) {
          next()
          return
        }

        s3Client.createBucket({
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: region
          }
        }, function (err, data) {
          // E.g. data: {"Location": "http://trentm-play-s3-bukkit2.s3.amazonaws.com/"}
          log.info({ err, data }, 'createBucket')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#bucketExists-waiter
      function waitForBucketToExist (_, next) {
        s3Client.waitFor('bucketExists', { Bucket: bucketName }, function (err, data) {
          log.info({ err, data }, 'waitFor bucketExists')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
      function createObj (_, next) {
        var md5 = crypto.createHash('md5').update(content).digest('base64')
        s3Client.putObject({
          Bucket: bucketName,
          Key: key,
          ContentType: 'text/plain',
          Body: content,
          ContentMD5: md5
        }, function (err, data) {
          // data.ETag should match a hexdigest md5 of body.
          log.info({ err, data }, 'putObject')
          next(err)
        })
      },

      function waitForObjectToExist (_, next) {
        s3Client.waitFor('objectExists', {
          Bucket: bucketName,
          Key: key
        }, function (err, data) {
          log.info({ err, data }, 'waitFor objectExists')
          next(err)
        })
      },

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property
      function getObj (_, next) {
        s3Client.getObject({
          Bucket: bucketName,
          Key: key
        }, function (err, data) {
          log.info({ err, data }, 'getObject')
          next(err)
        })
      },

      function getObjConditionalGet (_, next) {
        const md5hex = crypto.createHash('md5').update(content).digest('hex')
        const etag = `"${md5hex}"`
        s3Client.getObject({
          IfNoneMatch: etag,
          Bucket: bucketName,
          Key: key
        }, function (err, data) {
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

      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObject-property
      function deleteTheObj (_, next) {
        s3Client.deleteObject({
          Bucket: bucketName,
          Key: key
        }, function (err, data) {
          log.info({ err, data }, 'deleteObject')
          next(err)
        })
      },

      function deleteTheBucketIfCreatedIt (arg, next) {
        if (arg.bucketIsPreexisting) {
          next()
          return
        }

        s3Client.deleteBucket({
          Bucket: bucketName
        }, function (err, data) {
          log.info({ err, data }, 'deleteBucket')
          next(err)
        })
      }
    ]
  }, function (err) {
    if (err) {
      log.error({ err }, 'unexpected error using S3')
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

  const s3Client = new AWS.S3({
    apiVersion: '2006-03-01',
    region,
    endpoint
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
