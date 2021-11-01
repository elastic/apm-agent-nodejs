'use strict'

var util = require('util')

var ObjectIdentityMap = require('object-identity-map')

const constants = require('../constants')
var getPathFromRequest = require('./express-utils').getPathFromRequest
var GenericSpan = require('./generic-span')
var parsers = require('../parsers')
var Span = require('./span')
var symbols = require('../symbols')
var { TransactionIds } = require('./ids')

module.exports = Transaction

util.inherits(Transaction, GenericSpan)

function Transaction (agent, name, ...args) {
  GenericSpan.call(this, agent, ...args)

  const verb = this.parentId ? 'continue' : 'start'
  agent.logger.debug('%s trace %o', verb, { trans: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type, subtype: this.subtype, action: this.action })

  this._defaultName = name || ''
  this._customName = ''
  this._user = null
  this._custom = null
  this._result = 'success'
  this._builtSpans = 0
  this._droppedSpans = 0
  this._abortTime = 0
  this._breakdownTimings = new ObjectIdentityMap()
  this._faas = undefined
  this._service = null
  this._message = null
  this.outcome = constants.OUTCOME_UNKNOWN
}

Object.defineProperty(Transaction.prototype, 'name', {
  configurable: true,
  enumerable: true,
  get () {
    // Fall back to a somewhat useful name in case no _defaultName is set.
    // This might happen if res.writeHead wasn't called.
    return this._customName ||
      this._defaultName ||
      (this.req ? this.req.method + ' unknown route (unnamed)' : 'unnamed')
  },
  set (name) {
    if (this.ended) {
      this._agent.logger.debug('tried to set transaction.name on already ended transaction %o', { trans: this.id, parent: this.parentId, trace: this.traceId })
      return
    }
    this._agent.logger.debug('setting transaction name %o', { trans: this.id, parent: this.parentId, trace: this.traceId, name: name })
    this._customName = name
  }
})

Object.defineProperty(Transaction.prototype, 'result', {
  configurable: true,
  enumerable: true,
  get () {
    return this._result
  },
  set (result) {
    if (this.ended) {
      this._agent.logger.debug('tried to set transaction.result on already ended transaction %o', { trans: this.id, parent: this.parentId, trace: this.traceId })
      return
    }
    this._agent.logger.debug('setting transaction result %o', { trans: this.id, parent: this.parentId, trace: this.traceId, result: result })
    this._result = result
  }
})

Object.defineProperty(Transaction.prototype, 'ids', {
  get () {
    return this._ids === null
      ? (this._ids = new TransactionIds(this))
      : this._ids
  }
})

Transaction.prototype.toString = function () {
  return this.ids.toString()
}

Transaction.prototype.setUserContext = function (context) {
  if (!context) return
  this._user = Object.assign(this._user || {}, context)
}

Transaction.prototype.setServiceContext = function (serviceContext) {
  if (!serviceContext) return
  this._service = Object.assign(this._service || {}, serviceContext)
}

Transaction.prototype.setMessageContext = function (messageContext) {
  if (!messageContext) return
  this._message = Object.assign(this._message || {}, messageContext)
}

Transaction.prototype.setFaas = function (faasFields) {
  if (!faasFields) return
  this._faas = Object.assign(this._faas || {}, faasFields)
}

Transaction.prototype.setCustomContext = function (context) {
  if (!context) return
  this._custom = Object.assign(this._custom || {}, context)
}

Transaction.prototype.setCloudContext = function (cloudContext) {
  if (!cloudContext) return
  this._cloud = Object.assign(this._cloud || {}, cloudContext)
}

// Create a span on this transaction and make it the current span.
Transaction.prototype.startSpan = function (...spanArgs) {
  const span = this.createSpan(...spanArgs)
  if (span) {
    this._agent._instrumentation.supersedeWithSpanRunContext(span)
  }
  return span
}

// Create a span on this transaction.
//
// This does *not* replace the current run context to make this span the
// "current" one. This allows instrumentations to avoid impacting the run
// context of the calling code. Compare to `startSpan`.
Transaction.prototype.createSpan = function (...spanArgs) {
  if (!this.sampled) {
    return null
  }
  if (this.ended) {
    this._agent.logger.debug('transaction already ended - cannot build new span %o', { trans: this.id, parent: this.parentId, trace: this.traceId }) // TODO: Should this be supported in the new API?
    return null
  }
  if (this._builtSpans >= this._agent._conf.transactionMaxSpans) {
    this._droppedSpans++
    return null
  }

  this._builtSpans++
  return new Span(this, ...spanArgs)
}

Transaction.prototype.toJSON = function () {
  var payload = {
    id: this.id,
    trace_id: this.traceId,
    parent_id: this.parentId,
    name: this.name,
    type: this.type || 'custom',
    subtype: this.subtype,
    action: this.action,
    duration: this.duration(),
    timestamp: this.timestamp,
    result: String(this.result),
    sampled: this.sampled,
    context: undefined,
    span_count: {
      started: this._builtSpans
    },
    outcome: this.outcome,
    faas: this._faas
  }

  if (this.sampled) {
    payload.context = {
      user: Object.assign(
        {},
        this.req && parsers.getUserContextFromRequest(this.req),
        this._user
      ),
      tags: this._labels || {},
      custom: this._custom || {}
    }

    // Only include dropped count when spans have been dropped.
    if (this._droppedSpans > 0) {
      payload.span_count.dropped = this._droppedSpans
    }

    var conf = this._agent._conf
    if (this.req) {
      payload.context.request = parsers.getContextFromRequest(this.req, conf, 'transactions')
    }
    if (this.res) {
      payload.context.response = parsers.getContextFromResponse(this.res, conf)
    }
  }

  // add sample_rate to transaction
  // https://github.com/elastic/apm/blob/master/specs/agents/tracing-sampling.md
  // Only set sample_rate on transaction payload if a valid trace state
  // variable is set.
  //
  // "If there is no tracestate or no valid es entry with an s attribute,
  //  then the agent must omit sample_rate from non-root transactions and
  //  their spans."
  const sampleRate = this.sampleRate
  if (sampleRate !== null) {
    payload.sample_rate = sampleRate
  }

  return payload
}

Transaction.prototype._encode = function () {
  if (!this.ended) {
    this._agent.logger.error('cannot encode un-ended transaction: %o', { trans: this.id, parent: this.parentId, trace: this.traceId })
    return null
  }

  return this.toJSON()
}

Transaction.prototype.setDefaultName = function (name) {
  this._agent.logger.debug('setting default transaction name: %s %o', name, { trans: this.id, parent: this.parentId, trace: this.traceId })
  this._defaultName = name
}

Transaction.prototype.setDefaultNameFromRequest = function () {
  var req = this.req
  var path = getPathFromRequest(req, false, this._agent._conf.usePathAsTransactionName)

  if (!path) {
    this._agent.logger.debug('could not extract route name from request %o', {
      url: req.url,
      type: typeof path,
      null: path === null, // because typeof null === 'object'
      route: !!req.route,
      regex: req.route ? !!req.route.regexp : false,
      mountstack: req[symbols.expressMountStack] ? req[symbols.expressMountStack].length : false,
      trans: this.id,
      parent: this.parentId,
      trace: this.traceId
    })
    path = 'unknown route'
  }

  this.setDefaultName(req.method + ' ' + path)
}

Transaction.prototype.ensureParentId = function () {
  return this._context.ensureParentId()
}

Transaction.prototype.end = function (result, endTime) {
  if (this.ended) {
    this._agent.logger.debug('tried to call transaction.end() on already ended transaction %o', { trans: this.id, parent: this.parentId, trace: this.traceId })
    return
  }

  if (result !== undefined && result !== null) {
    this.result = result
  }

  if (!this._defaultName && this.req) this.setDefaultNameFromRequest()

  this._timer.end(endTime)
  this._captureBreakdown(this)
  this.ended = true

  this._agent._instrumentation.addEndedTransaction(this)
  this._agent.logger.debug('ended transaction %o', { trans: this.id, parent: this.parentId, trace: this.traceId, type: this.type, result: this.result, name: this.name })
}

Transaction.prototype.setOutcome = function (outcome) {
  if (!this._isValidOutcome(outcome)) {
    this._agent.logger.trace(
      'Unknown outcome [%s] seen in Transaction.setOutcome, ignoring',
      outcome
    )
    return
  }

  if (this.ended) {
    this._agent.logger.debug(
      'tried to call Transaction.setOutcome() on already ended transaction %o',
      { trans: this.id, parent: this.parentId, trace: this.traceId })
    return
  }

  this._freezeOutcome()
  this.outcome = outcome
}

Transaction.prototype._setOutcomeFromHttpStatusCode = function (statusCode) {
  // if an outcome's been set from the API we
  // honor its value
  if (this._isOutcomeFrozen) {
    return
  }

  if (statusCode >= 500) {
    this.outcome = constants.OUTCOME_FAILURE
  } else {
    this.outcome = constants.OUTCOME_SUCCESS
  }
}

Transaction.prototype._captureBreakdown = function (span) {
  if (this.ended) {
    return
  }

  const agent = this._agent
  const metrics = agent._metrics
  const conf = agent._conf

  // Quick out if disableSend=true, no point in the processing time.
  if (conf.disableSend) {
    return
  }

  // Record span data
  if (this.sampled && conf.breakdownMetrics) {
    captureBreakdown(this, {
      transaction: transactionBreakdownDetails(this),
      span: spanBreakdownDetails(span)
    }, span._timer.selfTime)
  }

  // Record transaction data
  if (span instanceof Transaction) {
    for (const { labels, time, count } of this._breakdownTimings.values()) {
      const flattenedLabels = flattenBreakdown(labels)
      metrics.incrementCounter('span.self_time.count', flattenedLabels, count)
      metrics.incrementCounter('span.self_time.sum.us', flattenedLabels, time)
    }
  }
}

function transactionBreakdownDetails ({ name, type } = {}) {
  return {
    name,
    type
  }
}

function spanBreakdownDetails (span) {
  if (span instanceof Transaction) {
    return {
      type: 'app'
    }
  }

  const { type, subtype } = span
  return {
    type,
    subtype
  }
}

function captureBreakdown (transaction, labels, time) {
  const build = () => ({ labels, count: 0, time: 0 })
  const counter = transaction._breakdownTimings.ensure(labels, build)
  counter.time += time
  counter.count++
}

function flattenBreakdown (source, target = {}, prefix = '') {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'undefined' || value === null) continue
    if (typeof value === 'object') {
      flattenBreakdown(value, target, `${prefix}${key}::`)
    } else {
      target[`${prefix}${key}`] = value
    }
  }

  return target
}
