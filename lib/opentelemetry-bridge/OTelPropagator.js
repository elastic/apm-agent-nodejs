'use strict'

const oblog = require('./oblog')

// Implements interface TextMapPropagator from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/propagation/TextMapPropagator.ts
class OTelPropagator {
  constructor (agent) {
    this._agent = agent
  }

  // XXX Currently this is a no-op.
  inject (context, carrier) {
    oblog.apicall('OTelPropagator.inject(%o, %o)', context, carrier)
  }

  extract (context, carrier) {
    oblog.apicall('OTelPropagator.extract(%o, %o)', context, carrier)
    return context
  }

  fields () {
    oblog.apicall('OTelPropagator.fields()')
    return []
  }
}

module.exports = {
  OTelPropagator
}
