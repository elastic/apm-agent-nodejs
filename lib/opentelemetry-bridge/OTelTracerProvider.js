'use strict'

const oblog = require('./oblog')

class OTelTracerProvider {
  // @param {OTelTracer} tracer
  constructor (tracer) {
    this._tracer = tracer
  }

  getTracer (_name, _version, _options) {
    oblog.apicall('OTelTracerProvider.getTracer(...)')
    return this._tracer
  }
}

module.exports = {
  OTelTracerProvider
}
