'use strict'
const net = require('net')
const https = require('https')
const http = require('http')
const { elRequest } = require('../elrequest')

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
  /**
   * shared context object
   *
   * Used to pass shared state into our bound callbacks.
   *
   * @var object context
   */
  const context = {
    // used to track whether a logical error has occured
    // and avoid calling the client-programmer's callback
    // multiple times
    hasErrored: false,
    socket: false
  }

  const options = {
    method: 'GET',
    timeout: 5000,
    connectTimeout: timeoutMs
  }
  const url = `${protocol}://${host}:${port}/latest/dynamic/instance-identity/document`

  const req = elRequest(
    url,
    options,
    function(res) {
        const finalData = []
        res.on('data', function (data) {
          finalData.push(data)
        })
        res.on('end', function (data) {
          cb(null, formatMetadataStringIntoObject(finalData.join('')))
        })
    }
  )
  req.on('error', function (error) {
    cb(error)
  })

  req.end()
}

/**
 * Handles the timeout case
 *
 * If Node.js calls this function first, that means we've timed out before
 * the socket connected.  When this happens we set our "hasErrored"
 * flag to true, end the socket connection by destroying it, and then
 * return an error via our callback.
 */
function handleTimeout (context, host, cb) {
  if (context.hasErrored) {
    return null
  }
  context.hasErrored = true
  context.socket.destroy()
  const error = new Error('metadata server ping timed out')
  cb(error)
}

/**
 * Handles succesful 'socket ping'
 *
 * If Node.js calls this function first, that means our 'socket ping'
 * was a success.  When that happens we close the socket connection
 * by destroying it
 */
function handleSocketResponse (context, timeout, host, port, protocol, cb) {
  // if the timeout sentinal has been set, this means the socket took
  // too long to connect and we should not do anything. The handleTimeout
  // method will handle socket cleanup
  if (context.hasErrored) {
    return null
  }

  // we've done out initial "ping" and no longer need the socket
  context.socket.destroy()

  // since we didn't hit our timeout we need to cleanup the timer to
  // avoid our callback being called multiple times.
  clearTimeout(timeout)

  // make the actual request to the metadata server
  makeRequestToMetadataServer(host, port, protocol, cb)
}

/**
 * Makes the require to the metadata endpoint
 *
 * The makeRequestToMetadataServer makes the http request
 * to the AWS metadata server's endpoint, and extracs the
 * data from the service response into our cloud metadata
 * object.
 */
function makeRequestToMetadataServer (host, port, protocol, cb) {
  // make our request for data
  const options = {
    hostname: host,
    port: port,
    path: '/latest/dynamic/instance-identity/document',
    method: 'GET'
  }

  const transport = getTransport(protocol)
  const req = transport.request(options, function (res) {
    const finalData = []

    res.on('data', function (data) {
      finalData.push(data)
    })

    res.on('end', function (data) {
      cb(null, formatMetadataStringIntoObject(finalData.join('')))
    })
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

/**
 * Standard Node.js http/https juggling
 *
 * @param string protocol
 */
function getTransport (protocol) {
  if (protocol === 'http') {
    return http
  } else if (protocol === 'https') {
    return https
  }

  throw new Error(`I don't know what a ${protocol} transport module is`)
}

module.exports = { getMetadataAws }
