'use strict'
const { httpRequest } = require('../http-request')

function sanitizeHttpHeaderValue (value) {
  // no newlines, carriage returns, or ascii characters outside of 32 - 127
  const newValue = value.replace(/[\r\n]/g, '').replace(/[^\x32-\x7F]/g, '')
  return newValue
}

/**
 * Logic for making request to /latest/dynamic/instance-identity/document
 *
 * The headers parameter allow us to, if needed, set the IMDSv2 token
 */
function getMetadataAwsImplementation (host, port, headers, connectTimeoutMs, resTimeoutMs, protocol, logger, cb) {
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
        let result
        try {
          result = formatMetadataStringIntoObject(finalData.join(''))
        } catch (error) {
          logger.trace('aws metadata server responded, but there was an ' +
            'error parsing the result: %o', error)
          cb(error)
          return
        }
        cb(null, result)
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
 * Fetches metadata from either an IMDSv2 or IMDSv1 endpoint
 *
 * Attempts to fetch a token for an IMDSv2 service call.  If this call
 * is a success, then we call the instance endpoint with the token.  If
 * this call fails, then we call the instance endpoint without the token.
 *
 * A "success" to the token endpoint means an HTTP status code of 200
 * and a non-zero-length return value for the token.
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAws (host, port, connectTimeoutMs, resTimeoutMs, protocol, logger, cb) {
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
        const token = sanitizeHttpHeaderValue(finalData.join(''))
        const headers = {}
        if (token && res.statusCode === 200) {
          // uses return value from call to latest/api/token as token,
          // and takes extra steps to ensure characters are valid
          headers['X-aws-ec2-metadata-token'] = token
        }

        getMetadataAwsImplementation(
          host,
          port,
          headers,
          connectTimeoutMs,
          resTimeoutMs,
          protocol,
          logger,
          cb
        )
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

module.exports = { getMetadataAws }
