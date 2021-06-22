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

// XXX move this to shared
const { MockAPMServer } = require('../../../stacktraces/_mock_apm_server')

const endpoint = process.env.LOCALSTACK_HOST
  ? 'http://' + process.env.LOCALSTACK_HOST + ':4566' // used by docker-compose config
  : 'http://localhost:4566' // default to localstack

// Execute 'node fixtures/use-s3-callback-style.js' and assert APM server gets
// the expected spans.
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
      ['fixtures/use-s3-callback-style.js'],
      {
        cwd: __dirname,
        timeout: 10000, // sanity guard on the test hanging
        env: Object.assign({}, process.env, additionalEnv)
      },
      function done (err, stdout, stderr) {
        t.error(err, 'use-s3-callback-style.js errored out')
        if (err) {
          t.comment(`use-s3-callback-style stdout:\n${stdout}\n`)
          t.comment(`use-s3-callback-style stderr:\n${stderr}\n`)
        }
        t.ok(server.events[0].metadata, 'APM server got event metadata object')

        // Sort the events by timestamp, then work through each expected span.
        const events = server.events.slice(1)
        events.sort((a, b) => {
          const aTimestamp = (a.transaction || a.span).timestamp
          const bTimestamp = (b.transaction || b.span).timestamp
          return aTimestamp < bTimestamp ? -1 : 1
        })

        // First the transaction.
        t.ok(events[0].transaction, 'got the transaction')
        const tx = events.shift().transaction

        // Currently HTTP spans under each S3 span are included. Eventually
        // those will be excluded. Filter those out for now.
        const spans = events.map(e => e.span).filter(e => e.subtype !== 'http')

        // Compare some common fields across all spans.
        t.equal(spans.filter(s => s.trace_id === tx.trace_id).length,
          spans.length, 'all spans have the same trace_id')
        t.equal(spans.filter(s => s.transaction_id === tx.id).length,
          spans.length, 'all spans have the same transaction_id')
        t.equal(spans.filter(s => s.outcome === 'success').length,
          spans.length, 'all spans have outcome="success"')
        t.equal(spans.filter(s => s.sync === false).length,
          spans.length, 'all spans have sync=false')
        t.equal(spans.filter(s => s.sample_rate === 1).length,
          spans.length, 'all spans have sample_rate=1')
        spans.forEach(s => {
          // Remove variable and common fields to facilitate t.deepEqual below.
          delete s.id
          delete s.transaction_id
          delete s.parent_id
          delete s.trace_id
          delete s.timestamp
          delete s.duration
          delete s.outcome
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
            destination: {
              address: 'localhost',
              port: 4566,
              service: { name: 's3', type: 'storage' },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'listAllBuckets produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 CreateBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'CreateBucket',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'createTheBucketIfNecessary produced expected span')

        // XXX Could be a timing issue here.
        t.deepEqual(spans.shift(), {
          name: 'S3 HeadBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'HeadBucket',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'waitForBucketToExist produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 PutObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'PutObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'createObj produced expected span')

        // XXX Could be a timing issue here.
        t.deepEqual(spans.shift(), {
          name: 'S3 HeadObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'HeadObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'waitForObjectToExist produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'getObj produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'getObjConditionalGet produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 GetObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'GetObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'getObjUsingPromise produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 DeleteObject elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteObject',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'deleteTheObj produced expected span')

        t.deepEqual(spans.shift(), {
          name: 'S3 DeleteBucket elasticapmtest-bucket-1',
          type: 'storage',
          subtype: 's3',
          action: 'DeleteBucket',
          context: {
            destination: {
              address: 'elasticapmtest-bucket-1.localhost',
              port: 4566,
              service: {
                name: 's3',
                type: 'storage',
                resource: 'elasticapmtest-bucket-1'
              },
              cloud: { region: 'us-east-2' }
            }
          }
        }, 'deleteTheBucketIfCreatedIt produced expected span')

        t.equal(spans.length, 0, 'all spans accounted for')

        server.close()
        t.end()
      }
    )
  })
})
