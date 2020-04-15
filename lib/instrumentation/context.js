'use strict'

var { parseUrl } = require('../parsers')

// Get the port number including the default port for a protocols
function getPortNumber (port, protocol) {
  if (port === '') {
    port = protocol === 'http:' ? '80' : protocol === 'https:' ? '443' : ''
  }
  return port
}

exports.getHTTPDestination = function (url, spanType) {
  const { port, protocol, hostname, origin } = parseUrl(url)
  const portNumber = getPortNumber(port, protocol)

  // If hostname begins with [ and ends with ], assume that it's an IPv6 address.
  // since address and port are recorded separately, we are recording the
  // info in canonical form without square brackets
  const ipv6Hostname =
    hostname[0] === '[' &&
    hostname[hostname.length - 1] === ']'

  const address = ipv6Hostname ? hostname.slice(1, -1) : hostname

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
