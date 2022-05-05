'use strict'

const osdklog = require('./osdklog')

class OTelTracerProvider {
  // @param {OTelTracer} tracer
  constructor (tracer) {
    this._tracer = tracer
  }

  getTracer (_name, _version, _options) {
    osdklog.apicall('OTelTracerProvider.getTracer(...)')
    return this._tracer
  }
}

module.exports = {
  OTelTracerProvider
}
