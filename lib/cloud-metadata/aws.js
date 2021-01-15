'use strict'
const { httpRequest } = require('../http-request')

/**
 * Checks for metadata server then fetches data
 *
 * The getMetadataAws will fetch cloud metadata information
 * from Amazon's IMDSv1 endpoint and return (via callback)
 * the formatted metadata.
 *
 * Before fetching data, the server will be "pinged" by attempting
 * to connect via TCP with a short timeout.
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function getMetadataAws (host, port, timeoutMs, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: 5000,
    connectTimeout: timeoutMs
  }
  const url = `${protocol}://${host}:${port}/latest/dynamic/instance-identity/document`
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
    if (!requestHasErrored && error) {
      const error = new Error('request to metadata server timed out')
      requestHasErrored = true
      cb(error)
    }
  })

  req.on('connectTimeout', function (error) {
    req.destroy()
    if (!requestHasErrored && error) {
      requestHasErrored = true
      const error = new Error('could not ping metadata server')
      cb(error)
    }
  })

  req.on('error', function (error) {
    req.destroy()
    if (!requestHasErrored && error) {
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

module.exports = { getMetadataAws }
