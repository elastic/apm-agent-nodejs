'use strict'

const util = require('util')
const otel = require('@opentelemetry/api')

const logging = require('../logging')
const { fetchSpanKey } = require('./OTelBridgeRunContext')
const osdklog = require('./osdklog')
const { OTelContextManager } = require('./OTelContextManager')
const { OTelPropagator } = require('./OTelPropagator')
const { OTelTracerProvider } = require('./OTelTracerProvider')
const { OTelTracer } = require('./OTelTracer')

function setupOTelSDK (agent) {
  // XXX Support OTel SDK env vars? https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/sdk-environment-variables.md
  let success

  const log = (logging.isLoggerCustom(agent.logger)
    ? agent.logger
    : agent.logger.child({ 'event.module': 'otelsdk' }))

  // XXX A debug logging thing for during dev.
  const LOG_OTEL_API_CALLS = true
  if (LOG_OTEL_API_CALLS) {
    // osdklog.setApiCallLogFn(log.debug.bind(log))
    osdklog.setApiCallLogFn((...args) => {
      const s = util.format(...args)
      console.log('\x1b[90motelapi:\x1b[39m \x1b[32m' + s + '\x1b[39m')
    })
  }

  // Hook OTel's diagnostic logging into the agent logger.
  success = otel.diag.setLogger({
    verbose: log.trace.bind(log),
    debug: log.debug.bind(log),
    info: log.info.bind(log),
    warn: log.warn.bind(log),
    error: log.error.bind(log)
  }, otel.DiagLogLevel.ALL)
  if (!success) {
    log.error('could not register OpenTelemetry bridge diag logger')
    return
  }

  success = otel.trace.setGlobalTracerProvider(new OTelTracerProvider(new OTelTracer(agent)))
  if (!success) {
    log.error('could not register OpenTelemetry bridge TracerProvider')
    return
  }

  // The OTelBridgeRunContext class needs to get the SPAN_KEY before it can
  // be used.
  fetchSpanKey()

  success = otel.context.setGlobalContextManager(new OTelContextManager(agent))
  if (!success) {
    log.error('could not register OpenTelemetry bridge ContextManager')
    return
  }

  // XXX Is this needed?
  success = otel.propagation.setGlobalPropagator(new OTelPropagator(agent))
  if (!success) {
    log.error('could not register OpenTelemetry bridge Propagator')
  }
}

module.exports = {
  setupOTelSDK
}
