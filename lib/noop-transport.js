'use strict'

// A no-op (does nothing) Agent transport -- i.e. the APM server client API
// provided by elastic-apm-http-client. This is used when `disableSend=true`.

class NoopTransport {
  config (opts) {}

  addMetadataFilter (fn) {}

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

  // Inherited from Writable, called in agent.js.
  destroy () {}
}

module.exports = {
  NoopTransport
}
