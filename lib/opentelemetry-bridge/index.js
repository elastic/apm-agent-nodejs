const api = require('@opentelemetry/api')
const { Tracer } = require('@opentelemetry/sdk-trace-base')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { registerInstrumentations } = require('@opentelemetry/instrumentation')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express')

function getParent (options, context) {
  if (options.root) {
    return undefined
  }
  return api.trace.getSpanContext(context)
}

class ElasticApmTracer extends Tracer {
  constructor (...args) {
    super(...args)
    this.elasticApmAgent = null
  }

  startSpan (name, options = {}, context = api.context.active()) {
    // how to listen for end?
    const oTelSpan = super.startSpan(name, options, context)
    const parentContext = getParent(options, context)

    // for cases where we need to "create" a transaction,
    // this code relies on the fact the Elastic Node.js APM Agent
    // automatically starts a transaction for a remote context.
    // TODO: what to do about the Node agent's fundamental reliance
    //       on intercepting HTTP requests for transaction starting

    if (!parentContext) {
      // spec case:
      // span_or_transaction = createTransactionWithParent(otel_span.remote_context);
      this.elasticApmAgent._oTelEntrySpan = oTelSpan
    } else if (parentContext.isRemote) {
      // spec case:
      // span_or_transaction = createTransactionWithParent(otel_span.remote_context);
      this.elasticApmAgent._oTelEntrySpan = oTelSpan
    } else {
      // TODO: how do we end this span
      const elasticSpan = this.elasticApmAgent.startSpan(oTelSpan.name)
      elasticSpan._oTelSpan = oTelSpan
      console.log(oTelSpan)
    }
    return oTelSpan
  }

  setElasticApmAgent (agent) {
    this.elasticApmAgent = agent
  }
}

class ElasticeTraceProvider extends NodeTracerProvider {
  constructor (...args) {
    super(...args)
    this.elasticApmAgent = null
  }

  setElasticApmAgent (agent) {
    this.elasticApmAgent = agent
  }

  getTracer (name, version) {
    const tracer = new ElasticApmTracer(
      { name, version }, this._config, this
    )
    tracer.setElasticApmAgent(this.elasticApmAgent)
    return tracer
  }
}

function registerOpenTelemetryTraceProvider (agent) {
  const provider = new ElasticeTraceProvider()
  provider.setElasticApmAgent(agent)
  provider.register()
}

function registerOpenTelemetryInstrumentation () {
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation()
    ]
  })
}

module.exports = {
  registerOpenTelemetryTraceProvider,
  registerOpenTelemetryInstrumentation
}
