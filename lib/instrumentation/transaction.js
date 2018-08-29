'use strict'

var afterAll = require('after-all-results')
var truncate = require('unicode-byte-truncate')
var uuid = require('uuid')

var config = require('../config')
var getPathFromRequest = require('./express-utils').getPathFromRequest
var parsers = require('../parsers')
var Span = require('./span')
var symbols = require('../symbols')
var Timer = require('./timer')

module.exports = Transaction

function Transaction (agent, name, type) {
  Object.defineProperty(this, 'name', {
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
        agent.logger.debug('tried to set transaction.name on already ended transaction %o', { id: this.id })
        return
      }
      agent.logger.debug('setting transaction name %o', { id: this.id, name: name })
      this._customName = name
    }
  })

  Object.defineProperty(this, 'result', {
    configurable: true,
    enumerable: true,
    get () {
      return this._result
    },
    set (result) {
      if (this.ended) {
        agent.logger.debug('tried to set transaction.result on already ended transaction %o', { id: this.id })
        return
      }
      agent.logger.debug('setting transaction result %o', { id: this.id, result: result })
      this._result = result
    }
  })

  this.id = uuid.v4()
  this._defaultName = name || ''
  this._customName = ''
  this._user = null
  this._custom = null
  this._tags = null
  this.type = type || 'custom'
  this.result = 'success'
  this.spans = []
  this._builtSpans = []
  this._droppedSpans = 0
  this.ended = false
  this._abortTime = 0
  this._agent = agent
  this._agent._instrumentation.currentTransaction = this

  // Random sampling
  this.sampled = Math.random() <= this._agent._conf.transactionSampleRate

  agent.logger.debug('start transaction %o', { id: this.id, name: name, type: type })

  this._timer = new Timer()
}

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

Transaction.prototype.buildSpan = function () {
  if (!this.sampled) {
    return null
  }

  if (this.ended) {
    this._agent.logger.debug('transaction already ended - cannot build new span %o', { id: this.id })
    return null
  }
  if (this._builtSpans.length >= this._agent._conf.transactionMaxSpans) {
    this._droppedSpans++
    return null
  }

  var span = new Span(this)
  this._builtSpans.push(span)
  return span
}

Transaction.prototype.toJSON = function () {
  var payload = {
    id: this.id,
    name: this.name,
    type: this.type,
    duration: this.duration(),
    timestamp: new Date(this._timer.start).toISOString(),
    result: String(this.result),
    sampled: this.sampled,
    context: null,
    spans: null
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
      payload.span_count = {
        dropped: {
          total: this._droppedSpans
        }
      }
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

Transaction.prototype._encode = function (cb) {
  var self = this

  if (!this.ended) return cb(new Error('cannot encode un-ended transaction'))

  var payload = this.toJSON()
  var next = afterAll(function (err, spans) {
    if (err) return cb(err)

    if (self.sampled) {
      payload.spans = spans
    }

    cb(null, payload)
  })

  this.spans.forEach(function (span) {
    span._encode(next())
  })
}

Transaction.prototype.duration = function () {
  if (!this.ended) {
    this._agent.logger.debug('tried to call duration() on un-ended transaction %o', { id: this.id, name: this.name, type: this.type })
    return null
  }

  return this._timer.duration()
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

Transaction.prototype.end = function (result) {
  if (this.ended) {
    this._agent.logger.debug('tried to call transaction.end() on already ended transaction %o', { id: this.id })
    return
  }

  if (result !== undefined) {
    this.result = result
  }

  if (!this._defaultName && this.req) this.setDefaultNameFromRequest()

  this._builtSpans.forEach(function (span) {
    if (span.ended || !span.started) return
    span.truncate()
  })

  this._timer.end()
  this.ended = true

  var trans = this._agent._instrumentation.currentTransaction

  // These two edge-cases should normally not happen, but if the hooks into
  // Node.js doesn't work as intended it might. In that case we want to
  // gracefully handle it. That involves ignoring all spans under the given
  // transaction as they will most likely be incomplete. We still want to send
  // the transaction without any spans as it's still valuable data.
  if (!trans) {
    this._agent.logger.debug('WARNING: no currentTransaction found %o', { current: trans, spans: this.spans.length, id: this.id })
    this.spans = []
  } else if (trans !== this) {
    this._agent.logger.debug('WARNING: transaction is out of sync %o', { spans: this.spans.length, id: this.id, other: trans.id })
    this.spans = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  this._agent.logger.debug('ended transaction %o', { id: this.id, type: this.type, result: this.result, name: this.name })
}

Transaction.prototype._recordEndedSpan = function (span) {
  if (this.ended) {
    this._agent.logger.debug('Can\'t record ended span after parent transaction have ended - ignoring %o', { id: this.id, span: span.name })
    return
  }

  this.spans.push(span)
}
