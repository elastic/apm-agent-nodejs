/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

if (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'win32') {
  console.log('# SKIP: GH Actions do not support docker services on Windows');
  process.exit(0);
}

// Test the fix for bug #2134, that AWS4 signature auth with the aws-sdk
// and *retries* works as expected.

const apm = require('../../../..').start({
  serviceName: 'test-aws4-retries',
  cloudProvider: 'none',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  disableSend: true,
});

const http = require('http');

const AWS = require('aws-sdk');
const tape = require('tape');

tape.test('AWS4 signature auth with retry', function (t) {
  const BUKKIT = 'test-aws4-retries-bukkit';
  const KEY = 'aDir/aFile.txt';

  let traceparentRe;
  let tracestateRe;

  // Mock an S3 server and the expected 3 responses for the `HeadObject $KEY`
  // client request we'll make below.
  let numRequests = 0;
  const mockS3Server = http.createServer(function (req, res) {
    numRequests++;
    const signedHeaders = req.headers.authorization.split(/ /g)[2];
    switch (numRequests) {
      case 1:
        // Request 1: a request with credentials for us-east-1 (the wrong region)
        // results in a 400 response.
        t.equal(req.method, 'HEAD', 'request 1 method is HEAD');
        t.equal(
          req.url,
          '/' + BUKKIT + '/' + KEY,
          'request 1 path is /$BUKKIT/$KEY',
        );
        t.ok(
          /^AWS4-HMAC-SHA256 Credential=.*\/us-east-1\/.*/.test(
            req.headers.authorization,
          ),
          `request 1 "Authorization" header is for us-east-1: "${req.headers.authorization}"`,
        );
        t.equal(
          signedHeaders,
          'SignedHeaders=host;x-amz-content-sha256;x-amz-date,',
          'request 1 "Authorization" header has expected SignedHeaders',
        );
        t.ok(
          traceparentRe.test(req.headers.traceparent),
          'request 1 traceparent has expected trace id: ' +
            req.headers.traceparent,
        );
        t.ok(
          tracestateRe.test(req.headers.tracestate),
          'request 1 tracestate has expected es item',
        );
        res.writeHead(400, {});
        res.end();
        break;
      case 2:
        // Request 2: a "HEAD /" which responds with 'x-amz-bucket-region' header.
        // Still has credentials for wrong region, so responds with 400.
        t.equal(req.method, 'HEAD', 'request 2 method is HEAD');
        t.equal(req.url, '/' + BUKKIT, 'request 2 path is /$BUKKIT');
        t.ok(
          /^AWS4-HMAC-SHA256 Credential=.*\/us-east-1\/.*/.test(
            req.headers.authorization,
          ),
          `request 2 "Authorization" header is for us-east-1: "${req.headers.authorization}"`,
        );
        t.equal(
          signedHeaders,
          'SignedHeaders=host;x-amz-content-sha256;x-amz-date,',
          'request 2 "Authorization" header has expected SignedHeaders',
        );
        t.ok(
          traceparentRe.test(req.headers.traceparent),
          'request 2 traceparent has expected trace id: ' +
            req.headers.traceparent,
        );
        t.ok(
          tracestateRe.test(req.headers.tracestate),
          'request 2 tracestate has expected es item',
        );
        res.writeHead(400, { 'x-amz-bucket-region': 'us-west-1' });
        res.end();
        break;
      case 3:
        // Request 3: A HeadObject with creds for the correct region -> 200.
        t.equal(req.method, 'HEAD', 'request 3 method is HEAD');
        t.equal(
          req.url,
          '/' + BUKKIT + '/' + KEY,
          'request 3 path is /$BUKKIT/$KEY',
        );
        t.ok(
          /^AWS4-HMAC-SHA256 Credential=.*\/us-west-1\/.*/.test(
            req.headers.authorization,
          ),
          `request 3 "Authorization" header is for *us-west-1*: "${req.headers.authorization}"`,
        );
        // This is where the #2134 bug fix is being tested. Before that
        // bug fix, this instrumented aws-sdk client request was including
        // agent-added headers in `SignedHeaders=...`.
        t.equal(
          signedHeaders,
          'SignedHeaders=host;x-amz-content-sha256;x-amz-date,',
          'request 3 "Authorization" header has expected SignedHeaders',
        );
        t.ok(
          traceparentRe.test(req.headers.traceparent),
          'request 3 traceparent has expected trace id: ' +
            req.headers.traceparent,
        );
        t.ok(
          tracestateRe.test(req.headers.tracestate),
          'request 3 tracestate has expected es item',
        );
        res.writeHead(200, {
          'x-amz-id-2':
            'jF2PKn8hyuCt3lMJ+DWJfUwDUDFK/sLLa4dlrtLKKCtE9tEuU4ioy2WMtRJlNzuqMthx6ZkwXMg=',
          'x-amz-request-id': 'ZZ21R6SXK79FGQKT',
          date: 'Tue, 06 Jul 2021 20:01:44 GMT',
          'last-modified': 'Wed, 16 Jun 2021 20:49:08 GMT',
          etag: '"a6635133ab518139282063b0963cd2e4"',
          'accept-ranges': 'bytes',
          'content-type': 'text/plain',
          server: 'AmazonS3',
          'content-length': '15',
        });
        res.end();
        break;
      default:
        t.fail(`unexpected request number ${numRequests} to mock S3 server`);
    }
  });

  mockS3Server.listen(function () {
    // Start a transaction so we have a trace-context to propagate.
    const tx = apm.startTransaction('test-aws4-retries-manual-tx');
    t.comment('manual transaction trace id: ' + tx.traceId);
    traceparentRe = new RegExp(`^00-${tx.traceId}-`);
    tracestateRe = /es=s:1/;

    // Setup a client to (a) talk to the mock S3 server and (b) not specifying
    // a "region", so it gets the default "us-east-1".
    const s3Client = new AWS.S3({
      apiVersion: '2006-03-01',
      accessKeyId: 'fake',
      secretAccessKey: 'fake',
      // Use s3ForcePathStyle to avoid `$bucketName.localhost` attempted usage
      // by the client -- which fails on Windows.
      s3ForcePathStyle: true,
      endpoint: `http://localhost:${mockS3Server.address().port}`,
    });

    // Make a HeadObject request on a bucket that lives in a different
    // region (us-west-1 in this example).
    s3Client.headObject({ Bucket: BUKKIT, Key: KEY }, function (err, data) {
      t.ifErr(err, 'headObject did not return an error');
      t.ok(data, 'headObject returned data');
      // Spot check this data matches data from response 3 headers above.
      t.equal(
        data.ContentLength,
        15,
        'headObject data.ContentLength is as expected',
      );

      t.equal(
        numRequests,
        3,
        'the mock S3 server got 3 requests from the AWS.S3 client',
      );
      tx.end();
      mockS3Server.close();
      t.end();
    });
  });
});
