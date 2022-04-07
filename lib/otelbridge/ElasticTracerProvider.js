'use strict'

// XXX Not sure about "Elastic..." name vs "OTel..." vs "OTelBridge..."
class ElasticTracerProvider {
  // @param {ElasticTracer} tracer
  constructor (tracer) {
    this._tracer = tracer
  }

  getTracer (_name, _version, _options) {
    console.log('XXX ElasticTracerProvider.getTracer(...)')
    return this._tracer
  }
}

module.exports = {
  ElasticTracerProvider
}
