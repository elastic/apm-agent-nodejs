const opentelemetryApi = require("@opentelemetry/api");
const { SequelizeInstrumentation } = require('opentelemetry-instrumentation-sequelize');

// delegate TraceProvider -- will return a custom tracer that
// uses the agent APIs to create spans
//
// Implements every (i.e. a single) method of the trace provider API
// https://github.com/open-telemetry/opentelemetry-js-api/blob/3ccf157fe06616acb1530a561370b00c1a62101b/src/trace/tracer_provider.ts#L22

class DelegateTraceProvider {
  constructor(agent) {
    this.agent = agent
  }

  // TODO: we inherit name and version from the interface, but this
  //       prototype doesn't use them
  getTracer(name, version) {

    return new DelegateTracer(this.agent)
  }
}

// delegate tracer -- starts our spans (full tracer API not implemented)
// TODO: eventually this would need to implement every method of the
//       OpenTelemetry tracer interface
//       https://github.com/open-telemetry/opentelemetry-js-api/blob/3ccf157fe06616acb1530a561370b00c1a62101b/src/trace/tracer.ts#L24
class DelegateTracer {
  constructor(agent) {
    this.agent = agent
  }

  startSpan(name, attributes) {
    console.log('startSpan')
    const span = this.agent.startSpan(name)
    return new DelegateSpan(span)
  }
}

// delegate span -- wraps our spans incase the oTel span model
// and the elastic span model end up differing.
//
// TODO: this would eventually need to be expanded out to implement every
//       method of the open telementry span interface.
//       https://github.com/open-telemetry/opentelemetry-js-api/blob/3ccf157fe06616acb1530a561370b00c1a62101b/src/trace/span.ts#L32

class DelegateSpan {
  constructor(span) {
    this.span = span
  }

  end() {
    console.log('end span')
    this.span.end()
  }
}

function init(agent) {
  // the creation of the delegate trace provider
  // TODO: should probably be moved out of this
  // individual instrumentation file and started
  // elsewhere.
  const dtp = new DelegateTraceProvider(agent)
  opentelemetryApi.trace.getTracerProvider().setDelegate(dtp)

  // create the instrumentation
  return new SequelizeInstrumentation
}
module.exports = {init}
