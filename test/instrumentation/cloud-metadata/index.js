'use strict'
const tape = require('tape')

const { getCloudMetadata } = require('../../../lib/instrumentation/cloud-metadata')
const { getMetadataAws } = require('../../../lib/instrumentation/cloud-metadata/aws')

const { createTestServer, loadFixtureData } = require('./_lib')

tape('cloud metadata: main function returns aws data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'aws'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const host = 'localhost'
  const protocol = 'http'
  const listener = serverAws.listen(0, function () {
    const port = listener.address().port
    getCloudMetadata({
      aws: {
        host: host,
        protocol: protocol,
        port: port
      }
    },
    function (err, metadata) {
      t.error(err, 'no errors expected')
      t.ok(metadata, 'returned data')
      listener.close()
    }
    )
  })
})

tape('aws metadata: returns valid data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(8)

  const provider = 'aws'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)
  const host = 'localhost'
  const protocol = 'http'
  const listener = serverAws.listen(0, function () {
    const port = listener.address().port
    getMetadataAws(host, port, 100, protocol, function (err, metadata) {
      t.error(err, 'no errors expected')
      t.ok(metadata, 'returned data')
      t.equals(metadata.account.id, fixture.response.accountId, 'found expected metadata for account.id')
      t.equals(metadata.instance.id, fixture.response.instanceId, 'found expected metadata for')
      t.equals(metadata.availability_zone, fixture.response.availabilityZone, 'found expected metadata for')
      t.equals(metadata.machine.type, fixture.response.instanceType, 'found expected metadata for')
      t.equals(metadata.provider, provider, 'found expected metadata for')
      t.equals(metadata.region, fixture.response.region, 'found expected metadata for')
      listener.close()
    })
  })
})

tape('aws metadata: if socket ping times out', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(1)
  const serverAws = createTestServer('aws', 'default aws fixture')
  const host = 'localhost'
  const protocol = 'http'
  const listener = serverAws.listen(0, function () {
    const validPort = listener.address().port
    getMetadataAws(host, validPort, 0, protocol, function (err) {
      t.ok(err, 'expected timeout error')
    })
    listener.close()
  })
})

tape('aws metadata: if server is not there', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(1)
  const host = 'localhost'
  const invalidPort = 30001
  const protocol = 'http'
  getMetadataAws(host, invalidPort, 100, protocol, function (err) {
    t.ok(err, 'expected unreachable server error')
  })
})
