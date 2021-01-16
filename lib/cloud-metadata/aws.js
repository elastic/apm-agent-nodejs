'use strict'
const { httpRequest } = require('../http-request')

/**
 * Logic for making request to /latest/dynamic/instance-identity/document
 *
 * Allows setting OR skipping of token
 */
function getMetadataAws (host, port, headers, socketTimeoutMs, httpTimeout, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: httpTimeout,
    connectTimeout: socketTimeoutMs
  }
  if(headers) {
    options.headers = headers
  }
  const url = `${protocol}://${host}:${port}/latest/dynamic/instance-identity/document`
  let requestHasErrored = false
  const req = httpRequest(
    url,
    options,
    function (res) {
      console.log("hello")
      const finalData = []
      res.on('data', function (data) {
        finalData.push(data)
      })

      res.on('end', function (data) {
        try {
          const result = formatMetadataStringIntoObject(finalData.join(''))
          cb(null, result)
        } catch (e) {
          cb(e)
        }
      })
    }
  )

  req.on('timeout', function (error) {
    req.destroy()
    if (!requestHasErrored) {
      const error = new Error('request to metadata server timed out')
      requestHasErrored = true
      cb(error)
    }
  })

  req.on('connectTimeout', function (error) {
    req.destroy()
    if (!requestHasErrored) {
      requestHasErrored = true
      const error = new Error('could not ping metadata server')
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
 * Fetches metadata from unautorized IMDSv1
 *
 * The getMetadataAwsV1 will fetch cloud metadata information
 * from Amazon's IMDSv1 endpoint and return (via callback)
 * the formatted metadata.
 *
 * Uses our http-request library, which requires a server's socket connection
 * to respond in a short period of time.  This allows us to fail fast if we're
 * on a server without a cloud metadata endpoint
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
 * Fetches metadata from unautorized IMDSv2
 *
 * Similiar to getMetadataAwsV1, this function  will fetch cloud metadata
 * information from Amazon's IMDSv2 endpoint.  This is the same API server
 * and endpoint path -- but requires an auth token.  Customers are able to
 * configure Amazon servers to require an IMDSv2 endpoint
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAwsV2(host, port, socketTimeoutMs, httpTimeout, protocol, cb) {
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

      res.on('end', function (data) {
        try {
          const headers = {
            'X-aws-ec2-metadata-token':finalData.join('')
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
  const metadata = {}
  metadata.account = {
    id: data.accountId
  }
  metadata.instance = {
    id: data.instanceId
  }
  metadata.availability_zone = data.availabilityZone
  metadata.machine = {
    type: data.instanceType
  }
  metadata.provider = 'aws'
  metadata.region = data.region

  return metadata
}

module.exports = { getMetadataAwsV1, getMetadataAwsV2}
