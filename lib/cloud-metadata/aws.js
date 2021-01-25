'use strict'
const { httpRequest } = require('../http-request')
function getLogger () {
  return require('../..').logger
}

/**
 * Logic for making request to /latest/dynamic/instance-identity/document
 *
 * The headers parameter allow us to, if needed, set the IMDSv2 token
 */
function getMetadataAws (host, port, headers, connectTimeoutMs, resTimeoutMs, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: resTimeoutMs,
    connectTimeout: connectTimeoutMs
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
    req.destroy(new Error('request to metadata server timed out'))
  })

  req.on('connectTimeout', function () {
    req.destroy(new Error('could not ping metadata server'))
  })

  req.on('error', function (error) {
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
 * to respond in a short period of time (connectTimeoutMs).  This allows us to
 * fail fast if we're on a server without a cloud metadata endpoint
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAwsV1 (host, port, connectTimeoutMs, resTimeoutMs, protocol, cb) {
  const headers = {}
  getMetadataAws(
    host,
    port,
    headers,
    connectTimeoutMs,
    resTimeoutMs,
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
function getMetadataAwsV2 (host, port, connectTimeoutMs, resTimeoutMs, protocol, cb) {
  const url = `${protocol}://${host}:${port}/latest/api/token`
  const options = {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': 300
    },
    timeout: resTimeoutMs,
    connectTimeout: connectTimeoutMs
  }
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
            connectTimeoutMs,
            resTimeoutMs,
            protocol,
            cb
          )
        } catch (e) {
          console.log(e)
          console.log(finalData.toString())
          cb(e)
        }
      })
    }
  )
  req.on('timeout', function () {
    req.destroy(new Error('request for metadata token timed out'))
  })

  req.on('connectTimeout', function () {
    req.destroy(new Error('socket connection to metadata token server timed out'))
  })

  req.on('error', function (error) {
    cb(error)
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
      id: String(data.accountId)
    },
    instance: {
      id: String(data.instanceId)
    },
    availability_zone: String(data.availabilityZone),
    machine: {
      type: String(data.instanceType)
    },
    provider: 'aws',
    region: String(data.region)
  }

  return metadata
}

module.exports = { getMetadataAwsV1, getMetadataAwsV2 }
