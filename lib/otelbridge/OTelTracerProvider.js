'use strict'

class OTelTracerProvider {
  // @param {OTelTracer} tracer
  constructor (tracer) {
    this._tracer = tracer
  }

  getTracer (_name, _version, _options) {
    console.log('XXX OTelTracerProvider.getTracer(...)')
    return this._tracer
  }
}

module.exports = {
  OTelTracerProvider
}
