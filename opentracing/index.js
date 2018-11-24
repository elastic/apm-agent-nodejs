'use strict'

const opentracing = require('opentracing')
const Noop = require('opentracing/lib/noop')
const ElasticTraceContext = require('../lib/instrumentation/trace-context')
const Agent = require('../lib/agent')
const Transaction = require('../lib/instrumentation/transaction')

const illigalChars = /[.*"]/g

class Tracer extends opentracing.Tracer {
  constructor (agent) {
    super()
    if (agent && agent instanceof Agent) {
      this._agent = agent
    } else {
      this._agent = require('../').start(agent)
    }
  }

  _startSpan (name, opts) {
    let context = null

    if (Array.isArray(opts.references)) {
      if (opts.references.length > 1) {
        this._agent.logger.debug('Elastic APM OpenTracing: Unsupported number of references to _startSpan:', opts.references.length)
      }

      for (const i in opts.references) {
        const ref = opts.references[i]
        const refType = ref.type()
        // TODO: Log warning if type is REFERENCE_FOLLOWS_FROM?
        if (refType === opentracing.REFERENCE_CHILD_OF) {
          context = ref.referencedContext()._elasticContext
          break
        }
      }
    }

    let tags, type

    if (opts.tags) {
      // We might delete tags leter on, so clone in order not to mutate
      tags = Object.assign({}, opts.tags)
      type = tags.type
      if (type) delete tags.type
    }

    let span = this._agent.currentTransaction === null || this._agent.currentTransaction.ended
      ? this._agent.startTransaction(name, type, { traceContext: context, startTime: opts.startTime })
      : this._agent.startSpan(name, type, { traceContext: context, startTime: opts.startTime })

    span = span ? new Span(this, span) : Noop.span // TODO: What happens when a user tries to use the context of a Noop span? Maybe the Noop span context should be the context of the transaction?

    if (tags && Object.keys(tags).length !== 0) span._addTags(tags)

    return span
  }

  _inject (spanContext, format, carrier) {
    switch (format) {
      case opentracing.FORMAT_TEXT_MAP:
      case opentracing.FORMAT_HTTP_HEADERS:
        carrier['elastic-apm-traceparent'] = spanContext.toString()
        break
    }
  }

  _extract (format, carrier) {
    let ctx

    switch (format) {
      case opentracing.FORMAT_TEXT_MAP:
      case opentracing.FORMAT_HTTP_HEADERS:
        ctx = ElasticTraceContext.fromString(carrier['elastic-apm-traceparent'])
        break
    }

    return ctx ? new SpanContext(ctx) : null
  }
}

class Span extends opentracing.Span {
  constructor (tracer, span) {
    super()
    this.__tracer = tracer
    this.__context = null
    this._span = span
    this._isTransaction = span instanceof Transaction
  }

  _context () {
    return this.__context
      ? this.__context
      : (this.__context = new SpanContext(this._span._context))
  }

  _tracer () {
    return this.__tracer
  }

  _setOperationName (name) {
    this._span.name = name
  }

  // Override the addTags function in order to be able to call _addTags
  // elsewhere without triggering the clone of `tags`
  addTags (tags) {
    // We might delete tags in _addTags, so clone in order not to mutate
    this._addTags(Object.assign({}, tags))
    return this
  }

  _addTags (tags) {
    if (this._isTransaction) {
      if (tags.result) {
        this._span.result = tags.result
        delete tags.result
      } else if (tags['http.status_code']) {
        this._span.result = `HTTP ${String(tags['http.status_code'])[0]}xx`
        delete tags['http.status_code']
      }
    }

    if (tags.type) {
      this._span.type = tags.type
      delete tags.type
    }

    const id = tags['user.id']
    const username = tags['user.username']
    const email = tags['user.email']
    if (id || username || email) {
      // TODO: Shold we differentiate if these tags are set on a span or a transaction?
      this.__tracer._agent.setUserContext({ id, username, email })
      delete tags['user.id']
      delete tags['user.username']
      delete tags['user.email']
    }

    const entries = Object.entries(tags)

    if (entries.length === 0) return

    // While the Node.js agent will sanitize the keys for us, it will also log
    // a warning each time. As periods are the norm in OpenTracing, we don't
    // want to log a warning each time a period is found, so we'll sanitize the
    // keys before forwarding the tags to the agent
    const sanitizedTags = {}
    for (const [key, value] of entries) {
      const sanitizedKey = key.replace(illigalChars, '_')
      sanitizedTags[sanitizedKey] = value
    }

    this._span.addTags(sanitizedTags)
  }

  _log (logs, timestamp) {
    if (logs.event === 'error') {
      if (logs['error.object']) {
        this.__tracer._agent.captureError(logs['error.object'], { timestamp, message: logs.message })
      } else if (logs.message) {
        this.__tracer._agent.captureError(logs.message, { timestamp })
      }
    }
  }

  _finish (finishTime) {
    if (this._isTransaction) {
      this._span.end(null, finishTime)
    } else {
      this._span.end(finishTime)
    }
  }
}

class SpanContext extends opentracing.SpanContext {
  constructor (elasticContext) {
    super()
    this._elasticContext = elasticContext
  }

  toString () {
    return this._elasticContext.toString()
  }
}

module.exports = Tracer
