'use strict'

const util = require('util')
const otel = require('@opentelemetry/api')

const logging = require('../logging')
const { fetchSpanKey } = require('./OTelBridgeRunContext')
const oblog = require('./oblog')
const { OTelContextManager } = require('./OTelContextManager')
const { OTelTracerProvider } = require('./OTelTracerProvider')
const { OTelTracer } = require('./OTelTracer')

function setupOTelBridge (agent) {
  let success

  const log = (logging.isLoggerCustom(agent.logger)
    ? agent.logger
    : agent.logger.child({ 'event.module': 'otelbridge' }))

  // Set `LOG_OTEL_API_CALLS = true` for development/debugging.
  // See docs in "oblog.js".
  const LOG_OTEL_API_CALLS = true // XXX
  if (LOG_OTEL_API_CALLS) {
    // oblog.setApiCallLogFn(log.debug.bind(log))
    oblog.setApiCallLogFn((...args) => {
      const s = util.format(...args)
      console.log('\x1b[90motelapi:\x1b[39m \x1b[32m' + s + '\x1b[39m')
    })
  }

  // Hook OTel's diagnostic logging into the agent logger.
  // XXX It isn't clear we want to hook it up this way.
  //    Is otel.diag meant to be a way for the user to configure access to
  //    the api and sdk's internal logging? If so, then pure OTel users might
  //    want the APM agent's logging to call `otel.diag.warn(...)` etc. rather
  //    than using ELASTIC_APM_LOG_LEVEL. They then would get full code
  //    control (ish).
  //    We would then want to capture the otel.diag.setLogger call to get
  //    the level at which to configure our agent.logger, otherwise we have
  //    to enable trace level all the time, which is expensive.
  //    So for now it feels like we keep this as is: we set a logger to see
  //    logging from the API and from user code that calls otel.diag.info et al
  //    themselves, and it comes out as our ecs-logging format logs.
  //    User code can call otel.diag.setLogger() to override that.
  //    TODO: explain usage of otel.diag in our user guide/reference. Does
  //      that usage differ greatly from pure OTel usage? If so, that might be
  //      a minor issue.
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
  }
}

module.exports = {
  setupOTelBridge
}
