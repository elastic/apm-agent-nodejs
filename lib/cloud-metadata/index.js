'use strict'
const { getMetadataAws } = require('./aws')
const { getMetadataAzure } = require('./azure')
const { getMetadataGcp } = require('./gcp')
const { EventEmitter } = require('events')
const defaultProviderConfig = {
  aws: {
    host: '169.254.169.254',
    port: 80,
    protocol: 'http'
  },
  azure: {
    host: '169.254.169.254',
    port:80,
    protocol: 'http'
  },
  gcp: {
    host: 'metadata.google.internal',
    port:80,
    protocol: 'http'
  }
}
const PING_TIMEOUT_MS = 100

/**
 * Coordinates fetching of metadata from multiple provides
 *
 * Implements event based coordination for fetching meta data
 * from multiple providers.  The first provider to return
 * a non-error result "wins".  When this happens the object
 * will emit a `result` event.
 *
 * If all the metadata providers fail to return a result, then the
 * object will emit an error event indicating which signals the
 * failure to collect metadata from any event.
 */
class FetchCoordination extends EventEmitter {
  constructor() {
    super()

    // how many results have we seen
    this.resultCount = 0
    this.expectedResults = 0
    this.errors = []
    this.scheduled = []
    this.done = false
  }

  /**
   * Accepts and schedules a callback function
   *
   * Callback will be in the form
   *     function(fetcher) {
   *         //... work to fetch data ...
   *
   *         // this callback calls the recordResult method
   *         // method of the fetcher
   *         fetcher.recordResult(error, result)
   *     }
   *
   * Method also increments expectedResults counter to keep track
   * of how many callbacks we're scheding
   */
  schedule(fetcherCallback) {
    this.expectedResults++
    this.scheduled.push(fetcherCallback)
  }

  /**
   * Starts processing of the callbacks scheduled by the `schedule` method
   */
  start() {
    for(const [,cb] of this.scheduled.entries()) {
      process.nextTick( cb.bind(null, this))
    }
  }

  /**
   * Receives calls from scheduled callbacks.
   *
   * If called with a non-error, the method will emit a `result` event
   * and include the results as an argument.  Only a single result
   * is emitted -- in the unlikely event of additional metadata servers
   * responding this method will ignore them.
   *
   * If called by _all_ scheduled callbacks without a non-error, this method
   * will issue an error event.
   *
   */
  recordResult(error, result) {
    this.resultCount++
    if(error) {
      this.errors.push(error)
      if(this.resultCount === this.expectedResults && !this.done) {
        // we've made every request with success, signal an error
        const error = new FetchCoordinationError('no metadata servers responded')
        error.allErrors = this.errors
        this.emit('error', error)
      }
    }

    if(!error && result && !this.done) {
      this.done = true
      this.emit('result', result)
    }
  }
}

/**
 * Error for FetchCoordination class
 *
 * Includes the individual errors from each callback
 * of the FetchCoordination object
 */
class FetchCoordinationError extends Error {
  constructor() {
    super(...arguments)
    this.allErrors = []
  }
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
 * defaultProviderConfig object will
 */
function getCloudMetadata (config, cb) {
  // normalize arguments
  if (!cb) {
    cb = config
    config = defaultProviderConfig
  }
  const fetcher = new FetchCoordination

  fetcher.schedule(function(fetcher){
    getMetadataGcp(
      config.gcp.host,
      config.gcp.port,
      PING_TIMEOUT_MS * 2, // extra ping time for DNS lookup
      config.gcp.protocol,
      (error, result) => {
        fetcher.recordResult(error, result)
      }
    )
  })

  fetcher.schedule(function(fetcher){
    getMetadataAws(
      config.aws.host,
      config.aws.port,
      PING_TIMEOUT_MS,
      config.aws.protocol,
      function (error, result) {
        fetcher.recordResult(error, result)
      }
    )
  })

  fetcher.schedule(function(fetcher){
    getMetadataAzure(
      config.azure.host,
      config.azure.port,
      PING_TIMEOUT_MS,
      config.azure.protocol,
      function (error, result) {
        fetcher.recordResult(error, result)
      }
    )
  })

  fetcher.start()

  fetcher.on('result', function(result){
    cb(null, result)
  })

  fetcher.on('error', function(error){
    cb(error)
  })
}

/**
 * Simple Command Line interface to fetch metadata
 *
 */
if (require.main === module) {
  function main(args) {
    getCloudMetadata(function(error, metadata){
      if(error) {
        console.log("could not fetch metadata")
        console.log(error)
        process.exit(1)
      } else {
        console.log("fetched the following metadata")
        console.log(metadata)
        process.exit(0)
      }
    })

  }
  main(process.argv)
}
module.exports = {
  getCloudMetadata
}
