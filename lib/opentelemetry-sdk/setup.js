'use strict'

const api = require('@opentelemetry/api')

const { fetchSpanKey } = require('./OTelBridgeRunContext')
const { OTelContextManager } = require('./OTelContextManager')
const { OTelPropagator } = require('./OTelPropagator')
const { OTelTracerProvider } = require('./OTelTracerProvider')
const { OTelTracer } = require('./OTelTracer')

function setupOTelSDK (agent) {
  // XXX Support OTel SDK env vars? https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/sdk-environment-variables.md

  // XXX hook into agent.logger
  let success = api.diag.setLogger({
    verbose () { console.log('diag VERBOSE:', ...arguments) },
    debug () { console.log('diag DEBUG:', ...arguments) },
    info () { console.log('diag INFO:', ...arguments) },
    warn () { console.log('diag WARN:', ...arguments) },
    error () { console.log('diag ERROR:', ...arguments) }
  }, api.DiagLogLevel.ALL)
  if (!success) {
    agent.logger.error('could not register OpenTelemetry bridge diag logger')
    return
  }

  success = api.trace.setGlobalTracerProvider(new OTelTracerProvider(new OTelTracer(agent)))
  if (!success) {
    agent.logger.error('could not register OpenTelemetry bridge TracerProvider')
    return
  }

  // The OTelBridgeRunContext class needs to get the SPAN_KEY before it can
  // be used.
  fetchSpanKey()

  success = api.context.setGlobalContextManager(new OTelContextManager(agent))
  if (!success) {
    agent.logger.error('could not register OpenTelemetry bridge ContextManager')
    return
  }

  // XXX Is this needed?
  success = api.propagation.setGlobalPropagator(new OTelPropagator(agent))
  if (!success) {
    agent.logger.error('could not register OpenTelemetry bridge Propagator')
  }
}

module.exports = {
  setupOTelSDK
}
