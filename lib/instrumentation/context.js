'use strict'

var { parseUrl } = require('../parsers')

const LEFT_SQUARE_BRACKET = 91 // [
const RIGHT_SQUARE_BRACKET = 93 // ]

// Get the port number including the default port for a protocols
function getPortNumber (port, protocol) {
  if (port === '') {
    port = protocol === 'http:' ? '80' : protocol === 'https:' ? '443' : ''
  }
  return port
}

function getDestination (url, spanType) {
  const { port, protocol, hostname, origin } = parseUrl(url)
  const portNumber = getPortNumber(port, protocol)

  // If hostname begins with [ and ends with ], assume that it's an IPv6 address.
  // since address and port are recorded separately, we are recording the
  // info in canonical form without square brackets
  const ipv6Hostname =
    hostname.charCodeAt(0) === LEFT_SQUARE_BRACKET &&
    hostname.charCodeAt(hostname.length - 1) === RIGHT_SQUARE_BRACKET

  let address = hostname
  if (ipv6Hostname) {
    address = hostname.slice(1, -1)
  }

  return {
    service: {
      name: origin,
      resource: hostname + ':' + portNumber,
      type: spanType
    },
    address,
    port: Number(portNumber)
  }
}

module.exports = { getDestination }
