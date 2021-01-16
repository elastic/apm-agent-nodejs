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
function getMetadataGcp (host, port, socketTimeoutMs, httpTimeout, protocol, cb) {
  const options = {
    method: 'GET',
    timeout: httpTimeout,
    connectTimeout: socketTimeoutMs,
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

  req.on('timeout', function () {
    req.destroy()
    if (!requestHasErrored) {
      const error = new Error('request to metadata server timed out')
      requestHasErrored = true
      cb(error)
    }
  })

  req.on('connectTimeout', function () {
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
 * Builds metadata object
 *
 * Takes the response from a /latest/dynamic/instance-identity/document
 * service request and formats it into the cloud metadata object
 */
function formatMetadataStringIntoObject (string) {
  const data = JSON.parse(string)
  // cast string manipulation fields as strings "just in case"
  if(data.instance) {
    data.instance.machineType = data.instance.machineType + ''
    data.instance.zone = data.instance.zone + ''
  }

  const metadata = {
    availability_zone: null,
    region: null,
    instance: {
      id: null
    },
    machine: {
      type: null
    },
    provider: null,
    project: {
      id: null,
      name: null
    }
  }

  metadata.availability_zone = null
  metadata.region = null
  if(data.instance && data.instance.zone) {
    // `projects/513326162531/zones/us-west1-b` manipuated into
    // `us-west1-b`, and then `us-west1`
    const regionWithZone = data.instance.zone.split('/').pop()
    const parts = regionWithZone.split('-')
    parts.pop()
    metadata.region = parts.join('-')
    metadata.availability_zone = regionWithZone
  }

  if(data.instance) {
    metadata.instance = {
      id: data.instance.id
    }

    metadata.machine = {
      type: data.instance.machineType.split('/').pop()
    }

  } else {
    metadata.instance = {
      id:null
    }

    metadata.machine = {
      type: null
    }
  }

  metadata.provider = 'gcp'

  if(data.project) {
    metadata.project = {
      id: data.project.numericProjectId,
      name: data.project.projectId
    }
  } else {
    metadata.project = {
      id: null,
      name: null
    }
  }
  return metadata
}

module.exports = { getMetadataGcp }
