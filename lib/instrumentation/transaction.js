'use strict'

var truncate = require('unicode-byte-truncate')

var config = require('../config')
var TraceContext = require('./trace-context')
var getPathFromRequest = require('./express-utils').getPathFromRequest
var parsers = require('../parsers')
var Span = require('./span')
var symbols = require('../symbols')
var Timer = require('./timer')

module.exports = Transaction

function Transaction (agent, name, type, traceparent) {
  this.context = TraceContext.startOrResume(traceparent, agent._conf)
  const verb = this.context.parentId ? 'continue' : 'start'
  agent.logger.debug('%s trace %o', verb, { id: this.id, name: name, type: type })

  this._agent = agent
  this._agent._instrumentation.currentTransaction = this
  this._agent._instrumentation.activeSpan = null

  this._defaultName = name || ''
  this._customName = ''
  this._user = null
  this._custom = null
  this._tags = null
  this.type = type || 'custom'
  this._result = 'success'
  this._builtSpans = 0
  this._droppedSpans = 0
  this._contextLost = false // TODO: Send this up to the server some how
  this.ended = false
  this._abortTime = 0
  this._timer = new Timer()
  this.timestamp = this._timer.start
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
      this._agent.logger.debug('tried to set transaction.name on already ended transaction %o', { id: this.id })
      return
    }
    this._agent.logger.debug('setting transaction name %o', { id: this.id, name: name })
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
      this._agent.logger.debug('tried to set transaction.result on already ended transaction %o', { id: this.id })
      return
    }
    this._agent.logger.debug('setting transaction result %o', { id: this.id, result: result })
    this._result = result
  }
})

Object.defineProperty(Transaction.prototype, 'id', {
  enumerable: true,
  get () {
    return this.context.id
  }
})

Object.defineProperty(Transaction.prototype, 'traceId', {
  enumerable: true,
  get () {
    return this.context.traceId
  }
})

Object.defineProperty(Transaction.prototype, 'parentId', {
  enumerable: true,
  get () {
    return this.context.parentId
  }
})

Object.defineProperty(Transaction.prototype, 'sampled', {
  enumerable: true,
  get () {
    return this.context.sampled
  }
})

Transaction.prototype.setUserContext = function (context) {
  if (!context) return
  this._user = Object.assign(this._user || {}, context)
}

Transaction.prototype.setCustomContext = function (context) {
  if (!context) return
  this._custom = Object.assign(this._custom || {}, context)
}

Transaction.prototype.setTag = function (key, value) {
  if (!key) return false
  if (!this._tags) this._tags = {}
  var skey = key.replace(/[.*]/g, '_')
  if (key !== skey) {
    this._agent.logger.warn('Illegal characters used in tag key: %s', key)
  }
  this._tags[skey] = truncate(String(value), config.INTAKE_STRING_MAX_SIZE)
  return true
}

Transaction.prototype.addTags = function (tags) {
  if (!tags) return false
  var keys = Object.keys(tags)
  for (let key of keys) {
    if (!this.setTag(key, tags[key])) {
      return false
    }
  }
  return true
}

Transaction.prototype.startSpan = function (name, type) {
  if (!this.sampled) {
    return null
  }

  if (this.ended) {
    this._agent.logger.debug('transaction already ended - cannot build new span %o', { id: this.id }) // TODO: Should this be supported in the new API?
    return null
  }
  if (this._builtSpans >= this._agent._conf.transactionMaxSpans) {
    this._droppedSpans++
    return null
  }
  this._builtSpans++

  return new Span(this, name, type)
}

Transaction.prototype.toJSON = function () {
  var payload = {
    id: this.id,
    trace_id: this.traceId,
    parent_id: this.parentId,
    name: this.name,
    type: this.type,
    duration: this.duration(),
    timestamp: this.timestamp,
    result: String(this.result),
    sampled: this.sampled,
    context: undefined,
    span_count: {
      started: this._builtSpans
    }
  }

  if (this.sampled) {
    payload.context = {
      user: Object.assign(
        {},
        this.req && parsers.getUserContextFromRequest(this.req),
        this._user
      ),
      tags: this._tags || {},
      custom: this._custom || {}
    }

    // Only include dropped count when spans have been dropped.
    if (this._droppedSpans > 0) {
      payload.span_count.dropped = this._droppedSpans
    }

    if (this.req) {
      var config = this._agent._conf.captureBody
      var captureBody = config === 'transactions' || config === 'all'
      payload.context.request = parsers.getContextFromRequest(this.req, captureBody)
    }
    if (this.res) {
      payload.context.response = parsers.getContextFromResponse(this.res)
    }
  }

  return payload
}

Transaction.prototype._encode = function () {
  if (!this.ended) {
    this._agent.logger.error('cannot encode un-ended transaction: ', this.id)
    return null
  }

  return this.toJSON()
}

Transaction.prototype.duration = function () {
  if (!this.ended) {
    this._agent.logger.debug('tried to call duration() on un-ended transaction %o', { id: this.id, name: this.name, type: this.type })
    return null
  }

  return this._timer.duration
}

Transaction.prototype.setDefaultName = function (name) {
  this._agent.logger.debug('setting default transaction name: %s %o', name, { id: this.id })
  this._defaultName = name
}

Transaction.prototype.setDefaultNameFromRequest = function () {
  var req = this.req
  var path = getPathFromRequest(req)

  if (!path) {
    this._agent.logger.debug('could not extract route name from request %o', {
      url: req.url,
      type: typeof path,
      null: path === null, // because typeof null === 'object'
      route: !!req.route,
      regex: req.route ? !!req.route.regexp : false,
      mountstack: req[symbols.expressMountStack] ? req[symbols.expressMountStack].length : false,
      id: this.id
    })
    path = 'unknown route'
  }

  this.setDefaultName(req.method + ' ' + path)
}

Transaction.prototype.ensureParentId = function () {
  return this.context.ensureParentId()
}

Transaction.prototype.end = function (result) {
  if (this.ended) {
    this._agent.logger.debug('tried to call transaction.end() on already ended transaction %o', { id: this.id })
    return
  }

  if (result !== undefined) {
    this.result = result
  }

  if (!this._defaultName && this.req) this.setDefaultNameFromRequest()

  this._timer.end()
  this.ended = true

  var trans = this._agent._instrumentation.currentTransaction

  // These two edge-cases should normally not happen, but if the hooks into
  // Node.js doesn't work as intended it might. In that case we want to
  // gracefully handle it. That involves ignoring all spans under the given
  // transaction as they will most likely be incomplete. We still want to send
  // the transaction without any spans as it's still valuable data.
  if (!trans) {
    this._agent.logger.debug('WARNING: no currentTransaction found %o', { current: trans, spans: this._builtSpans, id: this.id })
    this._contextLost = true
  } else if (trans !== this) {
    this._agent.logger.debug('WARNING: transaction is out of sync %o', { spans: this._builtSpans, id: this.id, other: trans.id })
    this._contextLost = true
  }

  this._agent._instrumentation.addEndedTransaction(this)
  this._agent.logger.debug('ended transaction %o', { id: this.id, type: this.type, result: this.result, name: this.name })
}
