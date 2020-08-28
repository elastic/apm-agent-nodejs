'use strict'

const net = require('net')
const http = require('http')

const VALID_CLOUD_PROVIDERS = ['aws', 'gcp', 'azure']
const VALID_CLOUD_PROVIDERS_OPTIONS = [...VALID_CLOUD_PROVIDERS, 'auto', false]

const isValidCloudProviderOption = (option) =>
  VALID_CLOUD_PROVIDERS_OPTIONS.includes(option)

const httpRequest = (url, method, headers, cb, { isJsonBody = true } = {}) => {
  const options = {
    method,
    headers: {
      'x-elastic-apm-agent-nodejs-ignore': '1',
      ...headers
    },
    timeout: 3000
  }

  const req = http.request(url, options, (res) => {
    let json = ''

    res.setEncoding('utf8')

    res.on('data', function (chunk) {
      json += chunk
    })

    // can happen in case the connection is closed prematurely
    res.once('aborted', () => {
      cb(undefined, new Error('Connection was aborted'))
    })

    res.once('end', function () {
      if (res.statusCode === 200) {
        try {
          const data = isJsonBody ? JSON.parse(json) : json
          cb(data)
        } catch (error) {
          cb(undefined, error)
        }
      } else {
        cb(
          undefined,
          new Error(
            `Received invalid status code from server: ${res.statusCode}`
          )
        )
      }
    })
  })

  req.once('timeout', () => {
    req.destroy(new Error('Request Timed Out'))
  })

  req.once('error', (error) => {
    cb(undefined, error)
  })

  req.end()
}

const cloudMetadataFetcherMap = {
  auto: (agent, cb) => {
    agent.logger.debug(
      'trying to automatically infer the cloud provider to fetch metadata from'
    )
    // This will try every cloud provider declared on VALID_CLOUD_PROVIDERS
    // and use the first one to return valid metadata, if no cloud provider
    // could be found it will log a warning and call the callback without passing
    // any metadata
    const runSeriesForAllMetadata = (cloud, next) => {
      return () => {
        cloudMetadataFetcherMap[cloud](agent, (metadata, error) => {
          if (metadata) return cb(metadata)
          if (!next) {
            agent.logger.warn(
              'Cloud provider metadata fetcher could not find the correct provider to use'
            )
            return cb()
          }

          next()
        })
      }
    }

    let nextCb

    for (const cloudProvider of VALID_CLOUD_PROVIDERS) {
      nextCb = runSeriesForAllMetadata(cloudProvider, nextCb)
    }

    // start the chain of requests
    nextCb()
  },
  aws: (agent, cb) => {
    agent.logger.debug('trying to fetch cloud metadata for aws')
    return isMetadataServerAvailable('169.254.169.254', 80, (isAvailable) => {
      if (!isAvailable) {
        agent.logger.debug('aws cloud metadata server not available')
        return cb()
      }

      // This request is almost unnecessary. IMDSv1 will be supported
      // indefinitely, so the only time this block is needed is if a
      // security-conscious user has set the metadata service to require
      // IMDSv2. Thus, the double network request
      // TODO: should we have a config option to completely disable IMDSv2 to reduce overhead?
      httpRequest(
        'http://169.254.169.254/latest/api/token',
        'PUT',
        {
          'X-aws-ec2-metadata-token-ttl-seconds': '300'
        },
        (token, error) => {
          let headers = {}

          if (!error) headers['X-aws-ec2-metadata-token'] = token

          httpRequest(
            'http://169.254.169.254/latest/dynamic/instance-identity/document',
            'GET',
            headers,
            (metadata, error) => {
              // possible empty response
              if (!metadata) return cb(undefined, error)

              agent.logger.debug('received cloud metadata for aws')

              cb({
                account: { id: metadata.accountId },
                instance: { id: metadata.instanceId },
                availability_zone: metadata.availabilityZone,
                machine: { type: metadata.instanceType },
                provider: 'aws',
                region: metadata.region
              })
            }
          )
        },
        { isJsonBody: false }
      )
    })
  },
  azure: (agent, cb) => {
    agent.logger.debug('trying to fetch cloud metadata for azure')

    return isMetadataServerAvailable('169.254.169.254', 80, (isAvailable) => {
      if (!isAvailable) {
        agent.logger.debug('azure cloud metadata server not available')
        return cb()
      }

      const headers = {
        Metadata: 'true'
      }

      httpRequest(
        'http://169.254.169.254/metadata/instance/compute?api-version=2019-08-15',
        'GET',
        headers,
        (metadata, error) => {
          // possible empty response
          if (!metadata) return cb(undefined, error)

          agent.logger.debug('received cloud metadata for azure')

          const apmCloudMetadata = {
            account: { id: metadata.subscriptionId },
            instance: { id: metadata.vmId, name: metadata.name },
            project: { name: metadata.resourceGroupName },
            machine: { type: metadata.vmSize },
            provider: 'azure',
            region: metadata.location
          }

          if (metadata.zone) {
            apmCloudMetadata.availability_zone = metadata.zone
          }

          cb(apmCloudMetadata)
        }
      )
    })
  },
  gcp: (agent, cb) => {
    agent.logger.debug('trying to fetch cloud metadata for gcp')

    return isMetadataServerAvailable(
      'metadata.google.internal',
      80,
      (isAvailable) => {
        if (!isAvailable) {
          agent.logger.debug('gcp cloud metadata server not available')
          return cb()
        }

        const headers = {
          'Metadata-Flavor': 'Google'
        }

        httpRequest(
          'http://metadata.google.internal/computeMetadata/v1/?recursive=true',
          'GET',
          headers,
          (metadata, error) => {
            // possible empty response
            if (!metadata) return cb(undefined, error)

            agent.logger.debug('received cloud metadata for gcp')

            const availabilityZone = metadata.instance.zone.split('/').pop()

            cb({
              provider: 'gcp',
              instance: {
                id: metadata.instance.id.toString(10),
                name: metadata.instance.name
              },
              project: {
                id: metadata.project.numericProjectId.toString(10),
                name: metadata.project.projectId
              },
              availability_zone: availabilityZone,
              region: availabilityZone.substring(
                0,
                availabilityZone.lastIndexOf('-')
              ),
              machine: { type: metadata.instance.machineType }
            })
          }
        )
      }
    )
  }
}

const isMetadataServerAvailable = (host, port, cb) => {
  let socket = net.createConnection({
    port,
    host,
    timeout: 500
  })

  const cleanup = () => {
    socket && !socket.destroyed && socket.destroy()
    socket = null
  }

  socket.once('timeout', () => {
    // this will internally emit the error event
    socket.destroy(new Error('Socket Timed Out'))
  })

  socket.once('connect', () => {
    cleanup()

    cb(true)
  })

  socket.once('error', (error) => {
    cleanup()

    cb(false)
  })
}

// This function returns another function accepting a callback.
// The returned function should be called when cloud metadata must be fetched.
// The passed callback will receive undefined or the metadata object.
// We are not passing errors to this callback to leave error handling
// internal to this function, avoiding having to handle these errors also
// on elastic-apm-http-client, which is the place where this function is really used.
const cloudMetadataFetcher = (agent, cloudProvider) => (cb) => {
  const fetchCloudMetadata = cloudMetadataFetcherMap[cloudProvider]

  if (!fetchCloudMetadata) {
    // should not really happen as we are validating the cloudProvider before this has a chance to be called...
    agent.logger.warn(
      `Cloud provider metadata fetcher failure. Unsupported cloud provider: ${cloudProvider}`
    )
    cb()
  } else {
    fetchCloudMetadata(agent, (metadata, error) => {
      if (error) {
        agent.logger.warn(
          'Cloud provider metadata fetcher failure: %s',
          error.message
        )
      }

      cb(metadata)
    })
  }
}

module.exports = {
  VALID_CLOUD_PROVIDERS,
  VALID_CLOUD_PROVIDERS_OPTIONS,
  isValidCloudProviderOption,
  cloudMetadataFetcher
}
