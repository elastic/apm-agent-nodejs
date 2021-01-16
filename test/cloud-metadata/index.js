'use strict'
const tape = require('tape')

const { CloudMetadata } = require('../../lib/cloud-metadata')
const { getMetadataAwsV1, getMetadataAwsV2 } = require('../../lib/cloud-metadata/aws')

const { createTestServer, loadFixtureData } = require('./_lib')

const providerConfig = {
  aws: {
    host: 'localhost',
    protocol: 'http',
    port: null
  },
  gcp: {
    host: 'localhost',
    protocol: 'http',
    port: null
  },
  azure: {
    host: 'localhost',
    protocol: 'http',
    port: null
  }
}

tape('cloud metadata: main function returns data with aws server', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(8)

  const provider = 'aws'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAws.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        t.equals(metadata.account.id, fixture.response.accountId, 'account id set')
        t.equals(metadata.instance.id, fixture.response.instanceId, 'instance id set')
        t.equals(metadata.availability_zone, fixture.response.availabilityZone, 'availability_zone set')
        t.equals(metadata.machine.type, fixture.response.instanceType, 'machine type set')
        t.equals(metadata.provider, provider, 'provider set')
        t.equals(metadata.region, fixture.response.region, 'region set')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: main function returns aws data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'aws'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAws.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
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
    getMetadataAwsV1(host, port, 100, 1000, protocol, function (err, metadata) {
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
    getMetadataAwsV1(host, validPort, 0, 1000, protocol, function (err) {
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
  getMetadataAwsV1(host, invalidPort, 100, 1000, protocol, function (err) {
    t.ok(err, 'expected unreachable server error')
  })
})

tape('cloud metadata: do not hang when none is configured', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'aws'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'none'
    }
  }
  const listener = serverAws.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.ok(err, 'error expected')
        t.ok(!metadata, 'no metadata returned')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: agent configuration wiring', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors

  const cloudMetadataAuto = new CloudMetadata({
    _conf: {
      cloudProvider: 'auto'
    }
  })
  t.ok(cloudMetadataAuto.shouldFetchAws(), 'auto configuration should fetch aws')
  t.ok(cloudMetadataAuto.shouldFetchGcp(), 'auto configuration should fetch gcp')
  t.ok(cloudMetadataAuto.shouldFetchAzure(), 'auto configuration should fetch azure')

  const cloudMetadataNone = new CloudMetadata({
    _conf: {
      cloudProvider: 'none'
    }
  })
  t.ok(!cloudMetadataNone.shouldFetchAws(), 'none configuration should NOT fetch aws')
  t.ok(!cloudMetadataNone.shouldFetchGcp(), 'none configuration should NOT fetch gcp')
  t.ok(!cloudMetadataNone.shouldFetchAzure(), 'none configuration should NOT fetch azure')

  const cloudMetadataAws = new CloudMetadata({
    _conf: {
      cloudProvider: 'aws'
    }
  })
  t.ok(cloudMetadataAws.shouldFetchAws(), 'aws configuration should fetch aws')
  t.ok(!cloudMetadataAws.shouldFetchGcp(), 'aws configuration should NOT fetch gcp')
  t.ok(!cloudMetadataAws.shouldFetchAzure(), 'aws configuration should NOT fetch azure')

  const cloudMetadataGcp = new CloudMetadata({
    _conf: {
      cloudProvider: 'gcp'
    }
  })
  t.ok(!cloudMetadataGcp.shouldFetchAws(), 'gcp configuration should NOT fetch aws')
  t.ok(cloudMetadataGcp.shouldFetchGcp(), 'gcp configuration should fetch gcp')
  t.ok(!cloudMetadataGcp.shouldFetchAzure(), 'gcp configuration should NOT fetch azure')

  const cloudMetadataAzure = new CloudMetadata({
    _conf: {
      cloudProvider: 'azure'
    }
  })
  t.ok(!cloudMetadataAzure.shouldFetchAws(), 'azure configuration should NOT fetch aws')
  t.ok(!cloudMetadataAzure.shouldFetchGcp(), 'azure configuration should NOT fetch gcp')
  t.ok(cloudMetadataAzure.shouldFetchAzure(), 'azure configuration should fetch azure')

  const cloudMetadataInvalid = new CloudMetadata({
    _conf: {
      cloudProvider: 'invalid-cloud-provider'
    }
  })
  t.ok(!cloudMetadataInvalid.shouldFetchAws(), 'invalid configuration should NOT fetch aws')
  t.ok(!cloudMetadataInvalid.shouldFetchGcp(), 'invalid configuration should NOT fetch gcp')
  t.ok(!cloudMetadataInvalid.shouldFetchAzure(), 'invalid configuration should NOT fetch azure')

  t.end()
})

tape('aws metadata: IMDSv2 returns valid data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(8)

  const provider = 'aws-IMDSv2'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)

  const host = 'localhost'
  const protocol = 'http'
  const listener = serverAws.listen(0, function () {
    const port = listener.address().port
    getMetadataAwsV2(host, port, 100, 1000, protocol, function (err, metadata) {
      t.error(err, 'no errors expected')
      t.ok(metadata, 'returned data')
      t.equals(metadata.account.id, fixture.response.accountId, 'found expected metadata for account.id')
      t.equals(metadata.instance.id, fixture.response.instanceId, 'found expected metadata for')
      t.equals(metadata.availability_zone, fixture.response.availabilityZone, 'found expected metadata for')
      t.equals(metadata.machine.type, fixture.response.instanceType, 'found expected metadata for')
      t.equals(metadata.provider, 'aws', `found expected metadata for ${t.name}`)
      t.equals(metadata.region, fixture.response.region, 'found expected metadata for')
      listener.close()
    })
  })
})

tape('cloud metadata: main function returns aws IMDSv2 data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'aws-IMDSv2'
  const fixtureName = 'default aws fixture'
  const serverAws = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAws.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: aws empty data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'aws'
  const fixtureName = 'aws does not crash on empty response'
  const serverAws = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAws.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: gcp empty data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'gcp'
  const fixtureName = 'gcp does not crash on empty response'
  const serverGcp = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverGcp.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: azure empty data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'azure'
  const fixtureName = 'azure does not crash on empty response'
  const serverAzure = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAzure.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: azure empty data', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'azure'
  const fixtureName = 'azure does not crash on mostly empty response'
  const serverAzure = createTestServer(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAzure.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: main function returns data with gcp server', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(9)

  const provider = 'gcp'
  const fixtureName = 'default gcp fixture'
  const serverGcp = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverGcp.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        t.equals(metadata.instance.id, fixture.response.instance.id, 'instance id is set')
        t.equals(metadata.provider, provider, 'provider is set')
        t.equals(metadata.project.id, fixture.response.project.numericProjectId, 'project id is set')
        t.equals(metadata.project.name, fixture.response.project.projectId, 'project name is set')

        // for properties we create via manipuation, just test hard coded
        // string contants rather than re-manipulate in that same, possibly
        // buggy, way
        t.equals(metadata.region, 'us-west1', 'region is set')
        t.equals(metadata.availability_zone, 'us-west1-b', 'availability_zone is set')
        t.equals(metadata.machine.type, 'e2-micro', 'machine type is set')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: main function returns data with azure server', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(10)

  const provider = 'azure'
  const fixtureName = 'default azure fixture'
  const serverAzure = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverAzure.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        t.equals(metadata.account.id, fixture.response.compute.subscriptionId, 'account id set')
        t.equals(metadata.instance.id, fixture.response.compute.vmId, 'instance id set')
        t.equals(metadata.instance.name, fixture.response.compute.name, 'instance name set')
        t.equals(metadata.project.name, fixture.response.compute.resourceGroupName, 'project name set')
        t.equals(metadata.availability_zone,'fake-zone', 'availability_zone set')
        t.equals(metadata.machine.type, fixture.response.compute.vmSize, 'machine type set')
        t.equals(metadata.provider, provider, 'provider set')
        t.equals(metadata.region, fixture.response.compute.location, 'region set')
        listener.close()
      }
    )
  })
})

tape('cloud metadata: gcp string manipulation does not fail on non-strings', function (t) {
  // t.plan helps ensure our callback is only called onces,
  // even though the "socket ping then real network request"
  // approach creates the potential for lots of errors
  t.plan(2)

  const provider = 'gcp'
  const fixtureName = 'gcp unexpected string fixture'
  const serverGcp = createTestServer(provider, fixtureName)
  const fixture = loadFixtureData(provider, fixtureName)
  const config = Object.assign({}, providerConfig)
  const agent = {
    _conf: {
      cloudProvider: 'auto'
    }
  }
  const listener = serverGcp.listen(0, function () {
    config.aws.port = listener.address().port
    config.gcp.port = listener.address().port
    config.azure.port = listener.address().port

    const cloudMetadata = new CloudMetadata(agent)
    cloudMetadata.getCloudMetadata(
      providerConfig,
      function (err, metadata) {
        t.error(err, 'no errors expected')
        t.ok(metadata, 'returned data')
        listener.close()
      }
    )
  })
})
