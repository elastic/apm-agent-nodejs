'use strict'
const { getMetadataAwsV1, getMetadataAwsV2 } = require('./aws')
const { getMetadataAzure } = require('./azure')
const { getMetadataGcp } = require('./gcp')
const { CallbackCoordination } = require('./callback-coordination')
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
// servers by having a listener that expects the underlying socket to
// connect.  CONNECT_TIMEOUT_MS control that time
const CONNECT_TIMEOUT_MS = 100

// some of the metadata servers have a dedicated domain name.  This
// value is added to the above socket ping to allow extra time for
// the DNS to resolve
const DNS_TIMEOUT_MS = 100

// the metadata servers are HTTP services.  This value is
// used as the timeout for the HTTP request that's
// made.
const HTTP_TIMEOUT_MS = 1000

// timeout for the CallbackCoordination object -- this is a fallback to
// account for a catastrophic error in the CallbackCoordination object
const COORDINATION_TIMEOUT_MS = 3000

class CloudMetadata {
  constructor (cloudProvider, logger) {
    this.cloudProvider = cloudProvider
    this.logger = logger
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
   * metadata servers.  If omitted, the function will use the  module-global
   * DEFAULT_PROVIDER_CONFIG values
   */
  getCloudMetadata (config, cb) {
    // normalize arguments
    if (!cb) {
      cb = config
      config = DEFAULT_PROVIDER_CONFIG
    }

    const fetcher = new CallbackCoordination(COORDINATION_TIMEOUT_MS, this.logger)

    if (this.shouldFetchGcp()) {
      fetcher.schedule(function (fetcher) {
        getMetadataGcp(
          config.gcp.host,
          config.gcp.port,
          CONNECT_TIMEOUT_MS + DNS_TIMEOUT_MS,
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
      // one -- which callback succeeds first will win
      fetcher.schedule(function (fetcher) {
        getMetadataAwsV1(
          config.aws.host,
          config.aws.port,
          CONNECT_TIMEOUT_MS,
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
          CONNECT_TIMEOUT_MS,
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
          CONNECT_TIMEOUT_MS,
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
    return this.cloudProvider === 'auto' || this.cloudProvider === 'gcp'
  }

  shouldFetchAzure () {
    return this.cloudProvider === 'auto' || this.cloudProvider === 'azure'
  }

  shouldFetchAws () {
    return this.cloudProvider === 'auto' || this.cloudProvider === 'aws'
  }
}

/**
 * Simple Command Line interface to fetch metadata
 *
 * $ node lib/cloud-metadata/index.js
 *
 * Will output metadata object or error if no servers are reachable
 */
function main (args) {
  const cloudMetadata = new CloudMetadata('auto')
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
