'use strict'

const osdklog = require('./osdklog')

// Implements interface TextMapPropagator from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/propagation/TextMapPropagator.ts
class OTelPropagator {
  constructor (agent) {
    this._agent = agent
  }

  // XXX Currently this is a no-op.
  inject (context, carrier) {
    osdklog.apicall('OTelPropagator.inject(%o, %o)', context, carrier)
  }

  extract (context, carrier) {
    osdklog.apicall('OTelPropagator.extract(%o, %o)', context, carrier)
    return context
  }

  fields () {
    osdklog.apicall('OTelPropagator.fields()')
    return []
  }
}

module.exports = {
  OTelPropagator
}
