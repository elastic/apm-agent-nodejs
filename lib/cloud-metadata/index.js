'use strict'
const { getMetadataAwsV1, getMetadataAwsV2 } = require('./aws')
const { getMetadataAzure } = require('./azure')
const { getMetadataGcp } = require('./gcp')
const { CallbackCoordination } = require('./fetch-coordination')
const DEFAULT_PROVIDER_CONFIG = {
  aws: {
    host: '169.254.169.254',
    port: 80,
    protocol: 'http'
  },
  azure: {
    host: '169.254.169.254',
    port: 80,
    protocol: 'http'
  },
  gcp: {
    host: 'metadata.google.internal',
    port: 80,
    protocol: 'http'
  }
}

// we "ping" (in the colloquial sense, not the ICMP sense) the metadata
// servers by having a listener that expects the underlying socker to
// connect.  PING_TIMEOUT_MS control that time
const PING_TIMEOUT_MS = 100

// some of the metadata servers have a dedicated domain name.  This
// value is added to the above socket ping to allow extra time for
// the DNS to resolve
const DNS_TIMEOUT_MS = 100

// the metadata servers are HTTP services.  This value is
// used as the timeout for the actuall HTTP request that's
// made.
const HTTP_TIMEOUT_MS = 1000

// timeout for the CallbackCoordination object
const COORDINATION_TIMEOUT_MS = 2000

class CloudMetadata {
  constructor (agent) {
    this.agent = agent
  }

  /**
   * Fetches Cloud Metadata
   *
   * The module's main entry-point/primary method.  The getCloudMetadata function
   * will query the cloud metadata servers and return (via a callback function)
   * to final metadata object.  This function may be called with a single
   * argument.
   *
   * getCloudMetadata(function(error, metadata){
   *     //...
   * })
   *
   * Or with two
   *
   * getCloudMetadata(config, function(error, metadata){
   *     //...
   * })
   *
   * The config parameter is an object that contains information on the
   * metadata servers.  If omitter, the function will use the  module-global
   * DEFAULT_PROVIDER_CONFIG object will
   */
  getCloudMetadata (config, cb) {
    // normalize arguments
    if (!cb) {
      cb = config
      config = DEFAULT_PROVIDER_CONFIG
    }
    const fetcher = new CallbackCoordination(COORDINATION_TIMEOUT_MS)

    if (this.shouldFetchGcp()) {
      fetcher.schedule(function (fetcher) {
        getMetadataGcp(
          config.gcp.host,
          config.gcp.port,
          PING_TIMEOUT_MS + DNS_TIMEOUT_MS,
          HTTP_TIMEOUT_MS,
          config.gcp.protocol,
          (error, result) => {
            fetcher.recordResult(error, result)
          }
        )
      })
    }

    if (this.shouldFetchAws()) {
      // amazon has two metadata endpoints -- IMDSv1 and IMDSv2
      // we schedule a callback to attempt to fetch from each
      // one -- which callback succesdes first will win
      fetcher.schedule(function (fetcher) {
        getMetadataAwsV1(
          config.aws.host,
          config.aws.port,
          PING_TIMEOUT_MS,
          HTTP_TIMEOUT_MS,
          config.aws.protocol,
          function (error, result) {
            fetcher.recordResult(error, result)
          }
        )
      })

      fetcher.schedule(function (fetcher) {
        getMetadataAwsV2(
          config.aws.host,
          config.aws.port,
          PING_TIMEOUT_MS,
          HTTP_TIMEOUT_MS,
          config.aws.protocol,
          function (error, result) {
            fetcher.recordResult(error, result)
          }
        )
      })
    }

    if (this.shouldFetchAzure()) {
      fetcher.schedule(function (fetcher) {
        getMetadataAzure(
          config.azure.host,
          config.azure.port,
          PING_TIMEOUT_MS,
          HTTP_TIMEOUT_MS,
          config.azure.protocol,
          function (error, result) {
            fetcher.recordResult(error, result)
          }
        )
      })
    }

    fetcher.on('result', function (result) {
      cb(null, result)
    })

    fetcher.on('error', function (error) {
      cb(error)
    })

    fetcher.start()
  }

  shouldFetchGcp () {
    return this.agent._conf.cloudProvider === 'auto' ||
      this.agent._conf.cloudProvider === 'gcp'
  }

  shouldFetchAzure () {
    return this.agent._conf.cloudProvider === 'auto' ||
      this.agent._conf.cloudProvider === 'azure'
  }

  shouldFetchAws () {
    return this.agent._conf.cloudProvider === 'auto' ||
      this.agent._conf.cloudProvider === 'aws'
  }
}

/**
 * Simple Command Line interface to fetch metadata
 *
 */
function main (args) {
  const cloudMetadata = new CloudMetadata({
    _conf: {
      cloudProvider: 'auto'
    }
  })
  cloudMetadata.getCloudMetadata(function (error, metadata) {
    if (error) {
      console.log('could not fetch metadata, see error below')
      console.log(error)
      process.exit(1)
    } else {
      console.log('fetched the following metadata')
      console.log(metadata)
      process.exit(0)
    }
  })
}

if (require.main === module) {
  main(process.argv)
}
module.exports = {
  CloudMetadata
}
