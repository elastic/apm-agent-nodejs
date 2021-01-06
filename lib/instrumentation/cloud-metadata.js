const net = require('net')
const https = require('https')
const http = require('http')


function handleTimeout(context, host, cb) {
  if(context.hasErrored) {
    return null
  }
  context.hasErrored = true
  const error = new Error(`Metadata Server not found`)
  cb(error)
}

function handleSocketResponse(context, timeout, host, port, protocol, cb) {
  // we've done out initial "ping" and no longer need the socket
  context.socket.destroy()

  // if the timeout sentinal has been set, this means the socket took
  // too long to connect and we should not do anything
  if(context.hasErrored) {
    return null
  }

  // if the timeout sentinal is NOT set, this means we didn't timeout
  // if that's the case clear our timer so it doesn't fire
  clearTimeout(timeout)

  makeRequestToMetadataServer(host, port, protocol, cb)
}

function makeRequestToMetadataServer(host, port, protocol, cb) {
  // make our request for data
  const options = {
    hostname: host,
    port: port,
    path: '/hello',
    method: 'GET'
  }

  const transport = getTransport(protocol)
  const req = transport.request(options, function(res) {
    const finalData = []

    res.on('data', function(data) {
      finalData.push(data)
    })

    res.on('end', function(data) {
      cb(null, finalData.join(''))
    })
  })

  req.on('error', function(error){
    cb(error)
  })

  req.end()
}

function getMetadataAws(host, port, timeoutMs, protocol, cb) {
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
    hasErrored:false,
    socket: false
  }

  const timeout = setTimeout(
    handleTimeout.bind(this, context, host, cb),
    timeoutMs
  )

  context.socket = net.createConnection(
    port,
    host,
    handleSocketResponse.bind(this, context, timeout, host, port, protocol, cb)
  )

  // createConnection does not use an error first callback, instead
  // we need to listen for the error
  context.socket.on('error', function(error) {
    if(context.hasErrored) {
      return null
    }
    context.hasErrored = true
    cb(error)
  })
}

/**
 * Standard Node.js http/https juggling
 *
 * @param string protocol
 */
function getTransport(protocol) {
  if(protocol === 'http') {
    return http
  } else if(protocol === 'https') {
    return https
  }

  throw new Error(`I don't know what a ${protocol} transport module is`)
}

module.exports = {
  getMetadataAws
}
