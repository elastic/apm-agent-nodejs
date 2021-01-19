'use strict'
const { httpRequest } = require('../http-request')
const { cleanupRequest } = require('./shared')
// Indirect usage of the singleton `Agent` to log.
function getLogger () {
  return require('../..').logger
}


/**
 * Checks for metadata server then fetches data
 *
 * The getMetadataAws will fetch cloud metadata information
 * from Amazon's IMDSv1 endpoint and return (via callback)
 * the formatted metadata.
 *
 * Before fetching data, the server will be "pinged" by attempting
 * to connect via TCP with a short timeout. (`socketTimeoutMs`)
 *
 * https://cloud.google.com/compute/docs/storing-retrieving-metadata
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
          getLogger().error('gcp metadata server responded, but there was an ' +
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
 * Builds metadata object
 *
 * Takes the response from a /computeMetadata/v1/?recursive=true
 * service request and formats it into the cloud metadata object
 */
function formatMetadataStringIntoObject (string) {
  const data = JSON.parse(string)
  // cast string manipulation fields as strings "just in case"
  if (data.instance) {
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
  if (data.instance && data.instance.zone) {
    // `projects/513326162531/zones/us-west1-b` manipuated into
    // `us-west1-b`, and then `us-west1`
    const regionWithZone = data.instance.zone.split('/').pop()
    const parts = regionWithZone.split('-')
    parts.pop()
    metadata.region = parts.join('-')
    metadata.availability_zone = regionWithZone
  }

  if (data.instance) {
    metadata.instance = {
      id: data.instance.id
    }

    metadata.machine = {
      type: data.instance.machineType.split('/').pop()
    }
  } else {
    metadata.instance = {
      id: null
    }

    metadata.machine = {
      type: null
    }
  }

  metadata.provider = 'gcp'

  if (data.project) {
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
