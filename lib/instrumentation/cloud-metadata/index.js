'use strict'
const { getMetadataAws } = require('./aws')
const defaultProviderConfig = {
  aws: {
    host: '169.254.169.254',
    port: 80,
    protocol: 'http'
  }
}
const PING_TIMEOUT_MS = 100

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
 * defaultProviderConfig object will
 */
function getCloudMetadata (config, cb) {
  // normalize arguments
  if (!cb) {
    cb = config
    config = defaultProviderConfig
  }

  // TODO: adding GCP, Azure, and Azure App Server collectors
  // will require some coordination

  getMetadataAws(
    config.aws.host,
    config.aws.port,
    PING_TIMEOUT_MS,
    config.aws.protocol,
    function (error, result) {
      cb(error, result)
    }
  )
}

module.exports = {
  getCloudMetadata
}
