'use strict'

// An Agent transport -- i.e. the APM server client API provided by
// elastic-apm-http-client -- that just captures all sent events.
//
// Usage:
//    const testAgentOpts = {
//      // ...
//      transport () { return new CapturingTransport() }
//    }
//
//    test('something', function (t) {
//      const agent = new Agent().start(testAgentOpts)
//      // Use `agent`, then assert that
//      // `agent._transport.{spans,transactions,errors,metricsets}` are as
//      // expected.
//      agent.destroy()
//      t.end()
//    })
//
// Note: This is similar to _mock_http_client.js, but avoids the testing model
// of using an expected number of sent APM events to decide when a test should
// end.

class CapturingTransport {
  constructor () {
    this.clear()
  }

  clear () {
    this.lambdaStartCalled = false
    this.extraMetadata = null
    this.spans = []
    this.transactions = []
    this.errors = []
    this.metricsets = []
  }

  config (opts) {}

  addMetadataFilter (fn) {}

  setExtraMetadata (metadata) {
    this.extraMetadata = metadata
  }

  lambdaStart () {
    this.lambdaStartCalled = true
  }

  sendSpan (span, cb) {
    this.spans.push(span)
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendTransaction (transaction, cb) {
    this.transactions.push(transaction)
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendError (error, cb) {
    this.errors.push(error)
    if (cb) {
      process.nextTick(cb)
    }
  }

  sendMetricSet (metricset, cb) {
    this.metricsets.push(metricset)
    if (cb) {
      process.nextTick(cb)
    }
  }

  flush (opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = {}
    } else if (!opts) {
      opts = {}
    }
    if (cb) {
      process.nextTick(cb)
    }
  }

  supportsKeepingUnsampledTransaction () {
    return true
  }

  // Inherited from Writable, called in agent.js.
  destroy () {}
}

module.exports = {
  CapturingTransport
}
