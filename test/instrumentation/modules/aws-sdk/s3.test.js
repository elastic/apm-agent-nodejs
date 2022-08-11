/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test S3 instrumentation of the 'aws-sdk' module.
//
// Note that this uses localstack for testing, which mimicks the S3 API but
// isn't identical. Some known limitations:
// - It basically does nothing with regions, so testing bucket region discovery
//   isn't possible.
// - AFAIK localstack does not support Access Points, so access point ARNs
//   cannot be tested.

const { execFile } = require('child_process')

const tape = require('tape')

const { MockAPMServer } = require('../../../_mock_apm_server')
const { validateSpan } = require('../../../_validate_schema')

const LOCALSTACK_HOST = process.env.LOCALSTACK_HOST || 'localhost'
const endpoint = 'http://' + LOCALSTACK_HOST + ':4566'

// Execute 'node fixtures/use-s3js' and assert APM server gets the expected
// spans.
tape.test('simple S3 usage scenario', function (t) {
  const server = new MockAPMServer()
  server.start(function (serverUrl) {
    const additionalEnv = {
      ELASTIC_APM_SERVER_URL: serverUrl,
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      TEST_BUCKET_NAME: 'elasticapmtest-bucket-1',
      TEST_ENDPOINT: endpoint,
      TEST_REGION: 'us-east-2'
    }
    t.comment('executing test script with this env: ' + JSON.stringify(additionalEnv))
    execFile(
      process.execPath,
      ['fixtures/use-s3.js'],
      {
        cwd: __dirname,
        timeout: 10000, // sanity guard on the test hanging
        env: Object.assign({}, process.env, additionalEnv)
      },
      function done (err, stdout, stderr) {
        t.error(err, 'use-s3.js did not error out')
        if (err) {
          t.comment(`use-s3.js stdout:\n${stdout}\n`)
          t.comment(`use-s3.js stderr:\n${stderr}\n`)
        }
        t.ok(server.events[0].metadata, 'APM server got event metadata object')

        // Sort the events by timestamp, then work through each expected span.
        const events = server.events.slice(1)
        events.sort((a, b) => {
          const aTimestamp = (a.transaction || a.span || {}).timestamp
          const bTimestamp = (b.transaction || b.span || {}).timestamp
          return aTimestamp < bTimestamp ? -1 : 1
        })

        // First the transaction.
        t.ok(events[0].transaction, 'got the transaction')
        const tx = events.shift().transaction
        const errors = events.filter(e => e.error).map(e => e.error)

        // Compare some common fields across all spans.
        const spans = events.filter(e => e.span)
          .map(e => e.span)
        spans.forEach(s => {
          const errs = validateSpan(s)
          t.equal(errs, null, 'span is valid  (per apm-server intake schema)')
        })
        t.equal(spans.filter(s => s.trace_id === tx.trace_id).length,
          spans.length, 'all spans have the same trace_id')
        t.equal(spans.filter(s => s.transaction_id === tx.id).length,
          spans.length, 'all spans have the same transaction_id')
        t.equal(spans.filter(s => s.sync === false).length,
          spans.length, 'all spans have sync=false')
        t.equal(spans.filter(s => s.sample_rate === 1).length,
          spans.length, 'all spans have sample_rate=1')
        const failingSpanId = spans[8].id // index of `getObjNonExistantObject`
        spans.forEach(s => {
          // Remove variable and common fields to facilitate t.deepEqual below.
          delete s.id
          delete s.transaction_id
          delete s.parent_id
          delete s.trace_id
          delete s.timestamp
          delete s.duration
          delete s.sync
          delete s.sample_rate
        })

        // Work through each of the pipeline functions (listAppBuckets,
        // createTheBucketIfNecessary, ...) in the script:
        t.deepEqual(spans.shift(), {
          name: 'S3 ListBuckets',
          type: 'storage',
          subtype: 's3',
          action: 'ListBuckets',
          context: {
            http: { status_code: 200, response: { encoded_body_size: 205 } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'listAllBuckets produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 CreateBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'CreateBucket',
          context: {
            http: { status_code: 200, response: { encoded_body_size: 177 } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'createTheBucketIfNecessary produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 HeadBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'HeadBucket',
          context: {
            http: { status_code: 200 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'waitForBucketToExist produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 PutObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'PutObject',
          context: {
            http: { status_code: 200 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'createObj produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 HeadObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'HeadObject',
          context: {
            http: { status_code: 200 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'waitForObjectToExist produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            http: { status_code: 200, response: { encoded_body_size: 8 } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'getObj produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            http: { status_code: 304 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'getObjConditionalGet produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            http: { status_code: 200, response: { encoded_body_size: 8 } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'getObjUsingPromise produced expected span')

        // This is the GetObject to a non-existant-key, so we expect a failure.
        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            http: { status_code: 404, response: { encoded_body_size: 207 } },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'failure'
        }, 'getObjNonExistantObject produced expected span')
        t.equal(errors.length, 1, 'got 1 error')
        t.equal(errors[0].parent_id, failingSpanId, 'error is a child of the failing span from getObjNonExistantObject')
        t.equal(errors[0].transaction_id, tx.id, 'error.transaction_id')
        t.equal(errors[0].exception.type, 'NoSuchKey', 'error.exception.type')

        t.deepEqual(spans.shift(), {
          name: 'S3 DeleteObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteObject',
          context: {
            http: { status_code: 204 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'deleteTheObj produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 DeleteBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteBucket',
          context: {
            http: { status_code: 204 },
            destination: {
              address: LOCALSTACK_HOST,
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          },
          outcome: 'success'
        }, 'deleteTheBucketIfCreatedIt produced expected span')

        t.equal(spans.length, 0, 'all spans accounted for')

        server.close()
        t.end()
      }
    )
  })
})
