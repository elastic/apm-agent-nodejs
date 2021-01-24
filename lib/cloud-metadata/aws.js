'use strict'
const { httpRequest } = require('../http-request')
const { cleanupRequest } = require('./shared')
function getLogger () {
  return require('../..').logger
}

/**
 * Logic for making request to /latest/dynamic/instance-identity/document
 *
 * The headers parameter allow us to, if needed, set the IMDSv2 token
 */
function getMetadataAws (host, port, headers, socketTimeoutMs, httpTimeout, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: httpTimeout,
    connectTimeout: socketTimeoutMs
  }
  if (headers) {
    options.headers = headers
  }
  const url = `${protocol}://${host}:${port}/latest/dynamic/instance-identity/document`
  const req = httpRequest(
    url,
    options,
    function (res) {
      const finalData = []
      res.on('data', function (data) {
        finalData.push(data)
      })

      res.on('end', function (data) {
        try {
          const result = formatMetadataStringIntoObject(finalData.join(''))
          cb(null, result)
        } catch (error) {
          getLogger().trace('aws metadata server responded, but there was an ' +
            'error parsing the result: %o', error)
          cb(error)
        }
      })
    }
  )

  req.on('timeout', function () {
    cleanupRequest(req)
    const error = new Error('request to metadata server timed out')
    cb(error)
  })

  req.on('connectTimeout', function () {
    cleanupRequest(req)
    const error = new Error('could not ping metadata server')
    cb(error)
  })

  req.on('error', function (error) {
    cleanupRequest(req)
    cb(error)
  })

  req.end()
}

/**
 * Fetches metadata from unauthorized IMDSv1 endpoint
 *
 * The getMetadataAwsV1 function will fetch cloud metadata information
 * from Amazon's IMDSv1 endpoint and return (via callback)
 * the formatted metadata.
 *
 * Uses our http-request library, which requires a server's socket connection
 * to respond in a short period of time (socketTimeoutMs).  This allows us to
 * fail fast if we're on a server without a cloud metadata endpoint
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAwsV1 (host, port, socketTimeoutMs, httpTimeout, protocol, cb) {
  const headers = {}
  getMetadataAws(
    host,
    port,
    headers,
    socketTimeoutMs,
    httpTimeout,
    protocol,
    cb
  )
}

/**
 * Fetches metadata from unauthorized IMDSv2 endpoint
 *
 * Similar to getMetadataAwsV1, getMetadataAwsV2 will fetch cloud metadata
 * information from Amazon's IMDSv2 endpoint.  This is the same API server
 * and endpoint path -- but requires an auth token.  AWS customers may have
 * their resources configured to be IMDSv2 only.
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAwsV2 (host, port, socketTimeoutMs, httpTimeout, protocol, cb) {
  const url = `${protocol}://${host}:${port}/latest/api/token`
  const options = {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': 300
    },
    timeout: httpTimeout,
    connectTimeout: socketTimeoutMs
  }
  let requestHasErrored = false
  const req = httpRequest(
    url,
    options,
    function (res) {
      const finalData = []
      res.on('data', function (data) {
        finalData.push(data)
      })

      res.on('end', function () {
        try {
          const headers = {
            'X-aws-ec2-metadata-token': finalData.join('')
          }
          getMetadataAws(
            host,
            port,
            headers,
            socketTimeoutMs,
            httpTimeout,
            protocol,
            cb
          )
        } catch (e) {
          cb(e)
        }
      })
    }
  )
  req.on('timeout', function () {
    req.destroy()
    if (!requestHasErrored) {
      const error = Error('request for metadata token timed out')
      requestHasErrored = true
      cb(error)
    }
  })

  req.on('connectTimeout', function () {
    req.destroy()
    if (!requestHasErrored) {
      requestHasErrored = true
      const error = Error('socket connection to metadata token server timed out')
      cb(error)
    }
  })

  req.on('error', function (error) {
    req.destroy()
    if (!requestHasErrored) {
      requestHasErrored = true
      cb(error)
    }
  })

  req.end()
}

/**
 * Builds metadata object
 *
 * Takes the response from a /latest/dynamic/instance-identity/document
 * service request and formats it into the cloud metadata object
 */
function formatMetadataStringIntoObject (string) {
  const data = JSON.parse(string)
  const metadata = {
    account: {
      id: null
    },
    instance: {
      id: null
    },
    availability_zone: null,
    machine: {
      type: null
    },
    provider: null,
    region: null
  }
  metadata.account.id = data.accountId + ''
  metadata.instance = {
    id: data.instanceId + ''
  }
  metadata.availability_zone = data.availabilityZone + ''
  metadata.machine = {
    type: data.instanceType + ''
  }
  metadata.provider = 'aws'
  metadata.region = data.region + ''

  return metadata
}

module.exports = { getMetadataAwsV1, getMetadataAwsV2 }
