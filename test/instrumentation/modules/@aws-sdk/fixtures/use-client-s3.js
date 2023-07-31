/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

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
//    node use-client-s3.js | ecslog
//
//    # Testing against localstack.
//    docker run --rm -it -e SERVICES=s3 -p 4566:4566 localstack/localstack
//    TEST_ENDPOINT=http://localhost:4566 node use-client-s3.js | ecslog
//
//    # Use TEST_BUCKET_NAME to re-use an existing bucket (and not delete it).
//    # For safety the bucket name must start with "elasticapmtest-bucket-".
//    TEST_BUCKET_NAME=elasticapmtest-bucket-3 node use-client-s3.js | ecslog
//
// Output from a sample run is here:
// https://gist.github.com/trentm/c402bcab8c0571f26d879ec0bcf5759c

const apm = require('../../../../..').start({
  serviceName: 'use-client-s3',
  captureExceptions: false,
  centralConfig: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  stackTraceLimit: 4, // get it smaller for reviewing output
  logLevel: 'info',
});

const crypto = require('crypto');
const assert = require('assert');
const {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  waitUntilBucketExists,
  waitUntilObjectExists,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const TEST_BUCKET_NAME_PREFIX = 'elasticapmtest-bucket-';

// ---- support functions

/**
 * Slurp everything from the given ReadableStream and return the content,
 * converted to a string.
 */
async function slurpStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('error', (err) => {
      reject(err);
    });
    stream.on('readable', function () {
      let chunk;
      while ((chunk = this.read()) !== null) {
        chunks.push(chunk);
      }
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/index.html
async function useClientS3(s3Client, bucketName) {
  const region = await s3Client.config.region();
  const log = apm.logger.child({
    'event.module': 'app',
    endpoint: s3Client.config.endpoint,
    bucketName,
    region,
  });
  const key = 'aDir/aFile.txt';
  const content = 'hi there';
  const md5hex = crypto.createHash('md5').update(content).digest('hex');
  const md5base64 = crypto.createHash('md5').update(content).digest('base64');
  const etag = `"${md5hex}"`;
  const waiterConfig = { client: s3Client, minwaitTime: 5, maxWaitTime: 10 };

  let command;
  let data;

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/listbucketscommand.html
  // Limitation: this doesn't handle paging.
  command = new ListBucketsCommand({});
  data = await s3Client.send(command);
  assert(
    apm.currentSpan === null,
    'S3 span (or its HTTP span) should not be currentSpan after awaiting the task',
  );
  log.info({ data }, 'listBuckets');

  const bucketIsPreexisting = data.Buckets.some((b) => b.Name === bucketName);
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/createbucketcommand.html
  if (!bucketIsPreexisting) {
    command = new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region,
      },
    });
    data = await s3Client.send(command);
    log.info({ data }, 'createBucket');
  }

  data = await waitUntilBucketExists(waiterConfig, { Bucket: bucketName });
  log.info({ data }, 'waitUntilBucketExists');

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/putobjectcommand.html
  command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: 'text/plain',
    Body: content,
    ContentMD5: md5base64,
  });
  data = await s3Client.send(command);
  log.info({ data }, 'putObject');

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/functions/waitforobjectexists.html
  data = await waitUntilObjectExists(waiterConfig, {
    Bucket: bucketName,
    Key: key,
  });
  log.info({ data }, 'waitUntilObjectExists');

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/getobjectcommand.html
  command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  data = await s3Client.send(command);
  // `data.Body` is a *stream*, so we cannot just log it
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/getobjectcommandoutput.html#body
  const body = await slurpStream(data.Body);
  assert(body === content);
  delete data.Body;
  log.info({ data, body }, 'getObject');

  // Get a signed URL.
  // This is interesting to test, because `getSignedUrl` uses the command
  // `middlewareStack` -- including our added middleware -- **without** calling
  // `s3Client.send()`. The test here is to ensure this doesn't break.
  const customSpan = apm.startSpan('get-signed-url');
  const signedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 3600 },
  );
  log.info({ signedUrl }, 'getSignedUrl');
  customSpan.end();

  command = new GetObjectCommand({
    IfNoneMatch: etag,
    Bucket: bucketName,
    Key: key,
  });
  try {
    data = await s3Client.send(command);
    throw new Error('expected NotModified error for conditional request');
  } catch (err) {
    log.info({ err }, 'getObject conditional get');
    const statusCode = err && err.$metadata && err.$metadata.httpStatusCode;
    if (statusCode !== 304) {
      throw err;
    }
  }

  command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key + '-does-not-exist',
  });
  try {
    data = await s3Client.send(command);
    throw new Error(
      `did not get an error from getObject(${key}-does-not-exist)`,
    );
  } catch (err) {
    log.info({ err }, 'getObject non-existant key, expect error');
  }

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObject-property
  command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
  data = await s3Client.send(command);
  log.info({ data }, 'deleteObject');

  if (!bucketIsPreexisting) {
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/deletebucketcorscommand.html
    command = new DeleteBucketCommand({ Bucket: bucketName });
    data = await s3Client.send(command);
    log.info({ data }, 'deleteBucket');
  }
}

// Return a timestamp of the form YYYYMMDDHHMMSS, which can be used in an S3
// bucket name:
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
function getTimestamp() {
  return new Date()
    .toISOString()
    .split('.')[0]
    .replace(/[^0-9]/g, '');
}

// ---- mainline

function main() {
  // Config vars.
  const region = process.env.TEST_REGION || 'us-east-2';
  const endpoint = process.env.TEST_ENDPOINT || null;
  const bucketName =
    process.env.TEST_BUCKET_NAME || TEST_BUCKET_NAME_PREFIX + getTimestamp();

  // Guard against any bucket name being used because we will be creating and
  // deleting objects in it, and potentially *deleting* the bucket.
  if (!bucketName.startsWith(TEST_BUCKET_NAME_PREFIX)) {
    throw new Error(
      `cannot use bucket name "${bucketName}", it must start with ${TEST_BUCKET_NAME_PREFIX}`,
    );
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
    forcePathStyle: true,
  });

  // Ensure an APM transaction so spans can happen.
  const tx = apm.startTransaction('manual');

  useClientS3(s3Client, bucketName).then(
    function () {
      tx.end();
      s3Client.destroy();
      process.exitCode = 0;
    },
    function (err) {
      apm.logger.error(err, 'useClientS3 rejected');
      tx.setOutcome('failure');
      tx.end();
      s3Client.destroy();
      process.exitCode = 1;
    },
  );
}

main();
