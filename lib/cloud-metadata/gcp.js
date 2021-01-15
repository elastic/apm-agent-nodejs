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
function getMetadataGcp (host, port, timeoutMs, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: 5000,
    connectTimeout: timeoutMs,
    headers: {
      'Metadata-Flavor': 'Google'
    }
  }
  const url = `${protocol}://${host}:${port}/computeMetadata/v1/?recursive=true`
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
    if (!requestHasErrored) {
      const cbError = error || new Error('request to metadata server timed out')
      requestHasErrored = true
      cb(cbError)
    }
  })

  req.on('connectTimeout', function (error) {
    req.destroy()
    if (!requestHasErrored && error) {
      requestHasErrored = true
      const cbError = error || new Error('could not ping metadata server')
      cb(cbError)
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

  const path = data.instance.zone.split('-').shift()
  const region = path.split('/').pop()
  const metadata = {}
  metadata.instance = {
    id: data.instance.id
  }
  metadata.availability_zone = data.instance.zone
  metadata.region = region
  metadata.machine = {
    type: data.instance.instanceType
  }
  metadata.provider = 'gcp'
  metadata.project = {
    id: data.project.numericProjectId,
    name: data.project.projectId
  }
  metadata.machine = {
    type: data.instance.machineType.split('/').pop()
  }

  return metadata
}

module.exports = { getMetadataGcp }
