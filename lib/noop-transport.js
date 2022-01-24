'use strict'

// A no-op (does nothing) Agent transport -- i.e. the APM server client API
// provided by elastic-apm-http-client.
//
// This is used for some configurations (when `disableSend=true` or when
// `contextPropagationOnly=true`) and in some tests.

class NoopTransport {
  config (opts) {}

  addMetadataFilter (fn) {}

  setExtraMetadata (metadata) {}

  sendSpan (span, cb) {
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendTransaction (transaction, cb) {
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendError (_error, cb) {
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendMetricSet (metricset, cb) {
    if (cb) {
      process.nextTick(cb)
    }
  }

  flush (cb) {
    if (cb) {
      process.nextTick(cb)
    }
  }

  supportsKeepingUnsampledTransaction () {
    return false // Default to the behavior for APM Server >=8.0.
  }

  // Inherited from Writable, called in agent.js.
  destroy () {}
}

module.exports = {
  NoopTransport
}
