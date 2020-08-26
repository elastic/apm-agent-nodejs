const net = require('net')

const VALID_CLOUD_PROVIDERS = ['aws', 'gcp', 'azure']
const VALID_CLOUD_PROVIDERS_OPTIONS = [
  ...VALID_CLOUD_PROVIDERS,
  'auto',
  false
]

const isValidCloudProviderOption = (option) =>
  VALID_CLOUD_PROVIDERS_OPTIONS.includes(option)

const cloudMetadataFetcherMap = {
  auto: (agent, cb) => {
    cb(undefined, new Error('Not implemented'))
  },
  aws: (agent, cb) => {
    cb(undefined, new Error('Not implemented'))
  },
  azure: (agent, cb) => {
    cb(undefined, new Error('Not implemented'))
  },
  gcp: (agent, cb) => {
    cb(undefined, new Error('Not implemented'))
  },
}

const isMetadataServerAvailable = (host, port, cb) => {
  let socket = net.createConnection(port, host)

  const cleanup = () => {
    socket && socket.destroy()
    socket = null
  }

  socket.once('connect', () => {
    cleanup()

    cb(true)
  })
  socket.once('error', (error) => {
    cleanup()

    cb(false)
  })
}

const cloudMetadataFetcher = (agent, cloudProvider) => (cb) => {
  const fetchCloudMetadata = cloudMetadataFetcherMap[cloudProvider]

  if  (!fetchCloudMetadata) {
    // should not really happen as we are validating the cloudProvider before this has a chance to be called...
    agent.logger.warn(`Cloud provider metadata fetcher failure. Unsupported cloud provider: ${cloudProvider}`)
    cb()
  } else {
    fetchCloudMetadata(agent, (metadata, error) => {
      if (error) {
        agent.logger.warn('Cloud provider metadata fetcher failure: %s', error.message)
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
