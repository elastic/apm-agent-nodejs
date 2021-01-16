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
function getMetadataAzure (host, port, socketTimeoutMs, httpTimeout, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: httpTimeout,
    connectTimeout: socketTimeoutMs,
    headers: {
      Metadata: 'true'
    }
  }
  const url = `${protocol}://${host}:${port}/metadata/instance?api-version=2020-09-01`
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

  req.on('timeout', function () {
    req.destroy()
    if (!requestHasErrored) {
      const error = new Error('request to azure metadata server timed out')
      requestHasErrored = true
      cb(error)
    }
  })

  req.on('connectTimeout', function () {
    req.destroy()
    if (!requestHasErrored) {
      requestHasErrored = true
      const error = new Error('could not ping azure metadata server')
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
  const parsed = JSON.parse(string)
  const data = parsed.compute
  const metadata = {}
  metadata.account = {
    id: data.subscriptionId
  }
  metadata.instance = {
    id: data.vmId,
    name: data.name
  }
  metadata.project = {
    name: data.resourceGroupName
  }
  metadata.availability_zone = data.zone
  metadata.machine = {
    type: data.vmSize
  }
  metadata.provider = 'azure'
  metadata.region = data.location

  return metadata
}

module.exports = { getMetadataAzure }
