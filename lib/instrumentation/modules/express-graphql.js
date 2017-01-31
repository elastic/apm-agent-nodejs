'use strict'

var semver = require('semver')
var debug = require('debug')('opbeat')

module.exports = function (graphqlHTTP, opbeat, version) {
  if (!semver.satisfies(version, '^0.6.1') || typeof graphqlHTTP !== 'function') {
    debug('express-graphql version %s not suppoted - aborting...', version)
    return graphqlHTTP
  }

  Object.keys(graphqlHTTP).forEach(function (key) {
    wrappedGraphqlHTTP[key] = graphqlHTTP[key]
  })

  return wrappedGraphqlHTTP

  function wrappedGraphqlHTTP () {
    var orig = graphqlHTTP.apply(this, arguments)

    if (typeof orig !== 'function') return orig

    // Express is very particular with the number of arguments!
    return function (req, res) {
      var trans = opbeat._instrumentation.currentTransaction
      if (trans) trans._graphqlRoute = true
      return orig.apply(this, arguments)
    }
  }
}
