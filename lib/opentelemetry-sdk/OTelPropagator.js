'use strict'

// Implements interface TextMapPropagator from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/propagation/TextMapPropagator.ts
class OTelPropagator {
  constructor (agent) {
    this._agent = agent
  }

  // XXX Currently this is a no-op.
  inject (context, carrier) {
    console.log('XXX OTelPropagator.inject(%o, %o)', context, carrier)
  }

  extract (context, carrier) {
    console.log('XXX OTelPropagator.extract(%o, %o)', context, carrier)
    return context
  }

  fields () {
    console.log('XXX OTelPropagator.fields()')
    return []
  }
}

module.exports = {
  OTelPropagator
}
