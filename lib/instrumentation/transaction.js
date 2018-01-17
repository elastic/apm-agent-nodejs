'use strict'

var uuid = require('uuid')
var afterAll = require('after-all-results')
var trunc = require('unicode-byte-truncate')
var express = require('./express-utils')
var debug = require('debug')('elastic-apm')
var logger = require('../logger')
var config = require('../config')
var parsers = require('../parsers')
var Timer = require('./timer')
var Span = require('./span')

module.exports = Transaction

function Transaction (agent, name, type) {
  Object.defineProperty(this, 'name', {
    configurable: true,
    enumerable: true,
    get: function () {
      // Fall back to a somewhat useful name in case no _defaultName is set.
      // This might happen if res.writeHead wasn't called.
      return this._customName ||
        this._defaultName ||
        (this.req ? this.req.method + ' unknown route (unnamed)' : 'unnamed')
    },
    set: function (name) {
      if (this.ended) {
        debug('tried to set transaction.name on already ended transaction %o', {id: this.id})
        return
      }
      debug('setting transaction name %o', {id: this.id, name: name})
      this._customName = name
    }
  })

  Object.defineProperty(this, 'result', {
    configurable: true,
    enumerable: true,
    get: function () {
      return this._result
    },
    set: function (result) {
      if (this.ended) {
        debug('tried to set transaction.result on already ended transaction %o', {id: this.id})
        return
      }
      debug('setting transaction result %o', {id: this.id, result: result})
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
  this.ended = false
  this._abortTime = 0
  this._agent = agent
  this._agent._instrumentation.currentTransaction = this

  debug('start transaction %o', {id: this.id, name: name, type: type})

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
  if (key !== skey) logger.warn('Illegal characters used in tag key: %s', key)
  this._tags[skey] = trunc(String(value), config.INTAKE_STRING_MAX_SIZE)
  return true
}

Transaction.prototype.buildSpan = function () {
  if (this.ended) {
    debug('transaction already ended - cannot build new span %o', {id: this.id})
    return null
  }

  var span = new Span(this)
  this._builtSpans.push(span)
  return span
}

Transaction.prototype._encode = function (cb) {
  var self = this

  if (!this.ended) return cb(new Error('cannot encode un-ended span'))

  var next = afterAll(function (err, spans) {
    if (err) return cb(err)

    var payload = {
      id: self.id,
      name: self.name,
      type: self.type,
      duration: self.duration(),
      timestamp: new Date(self._timer.start).toISOString(),
      result: String(self.result),
      context: {
        user: Object.assign(
          {},
          self.req && parsers.getUserContextFromRequest(self.req),
          self._user
        ),
        tags: self._tags || {},
        custom: self._custom || {}
      },
      spans: spans
    }

    if (self.req) {
      payload.context.request = parsers.getContextFromRequest(self.req, self._agent._conf.logBody)
    }
    if (self.res) {
      payload.context.response = parsers.getContextFromResponse(self.res)
    }

    cb(null, payload)
  })

  this.spans.forEach(function (span) {
    span._encode(next())
  })
}

Transaction.prototype.duration = function () {
  if (!this.ended) {
    debug('tried to call duration() on un-ended transaction %o', {id: this.id, name: this.name, type: this.type})
    return null
  }

  return this._timer.duration()
}

Transaction.prototype.setDefaultName = function (name) {
  debug('setting default transaction name: %s %o', name, {id: this.id})
  this._defaultName = name
}

Transaction.prototype.setDefaultNameFromRequest = function () {
  var req = this.req
  var path = express.getPathFromRequest(req)

  if (!path) {
    debug('could not extract route name from request %o', {
      url: req.url,
      type: typeof path,
      null: path === null, // because typeof null === 'object'
      route: !!req.route,
      regex: req.route ? !!req.route.regexp : false,
      mountstack: req._elastic_apm_mountstack ? req._elastic_apm_mountstack.length : false,
      id: this.id
    })
    path = 'unknown route'
  }

  this.setDefaultName(req.method + ' ' + path)
}

Transaction.prototype.end = function () {
  if (this.ended) {
    debug('tried to call transaction.end() on already ended transaction %o', {id: this.id})
    return
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
    debug('WARNING: no currentTransaction found %o', {current: trans, spans: this.spans.length, id: this.id})
    this.spans = []
  } else if (trans !== this) {
    debug('WARNING: transaction is out of sync %o', {spans: this.spans.length, id: this.id, other: trans.id})
    this.spans = []
  }

  this._agent._instrumentation.addEndedTransaction(this)
  debug('ended transaction %o', {id: this.id, type: this.type, result: this.result, name: this.name})
}

Transaction.prototype._recordEndedSpan = function (span) {
  if (this.ended) {
    debug('Can\'t record ended span after parent transaction have ended - ignoring %o', {id: this.id, span: span.name})
    return
  }

  this.spans.push(span)
}
