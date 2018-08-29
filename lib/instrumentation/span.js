'use strict'

var afterAll = require('after-all-results')
var Value = require('async-value-promise')

var parsers = require('../parsers')
var stackman = require('../stackman')
var Timer = require('./timer')

const TEST = process.env.ELASTIC_APM_TEST

module.exports = Span

function Span (transaction) {
  this.transaction = transaction
  this.started = false
  this.truncated = false
  this.ended = false
  this.name = null
  this.type = null
  this._db = null
  this._timer = null
  this._stackObj = null
  this._agent = transaction._agent

  this._agent.logger.debug('init span %o', { id: this.transaction.id })
}

Span.prototype.start = function (name, type) {
  if (this.started) {
    this._agent.logger.debug('tried to call span.start() on already started span %o', { id: this.transaction.id, name: this.name, type: this.type })
    return
  }

  this.started = true
  this.name = name || this.name || 'unnamed'
  this.type = type || this.type || 'custom'

  if (this._agent._conf.captureSpanStackTraces && !this._stackObj) {
    this._recordStackTrace()
  }

  this._timer = new Timer()

  this._agent.logger.debug('start span %o', { id: this.transaction.id, name: name, type: type })
}

Span.prototype.customStackTrace = function (stackObj) {
  this._agent.logger.debug('applying custom stack trace to span %o', { id: this.transaction.id })
  this._recordStackTrace(stackObj)
}

Span.prototype.truncate = function () {
  if (!this.started) {
    this._agent.logger.debug('tried to truncate non-started span - ignoring %o', { id: this.transaction.id, name: this.name, type: this.type })
    return
  } else if (this.ended) {
    this._agent.logger.debug('tried to truncate already ended span - ignoring %o', { id: this.transaction.id, name: this.name, type: this.type })
    return
  }
  this.truncated = true
  this.end()
}

Span.prototype.end = function () {
  if (!this.started) {
    this._agent.logger.debug('tried to call span.end() on un-started span %o', { id: this.transaction.id, name: this.name, type: this.type })
    return
  } else if (this.ended) {
    this._agent.logger.debug('tried to call span.end() on already ended span %o', { id: this.transaction.id, name: this.name, type: this.type })
    return
  }

  this._timer.end()
  this._agent._instrumentation._recoverTransaction(this.transaction)

  this.ended = true
  this._agent.logger.debug('ended span %o', { id: this.transaction.id, name: this.name, type: this.type, truncated: this.truncated })
  this.transaction._recordEndedSpan(this)
}

Span.prototype.duration = function () {
  if (!this.ended) {
    this._agent.logger.debug('tried to call span.duration() on un-ended span %o', { id: this.transaction.id, name: this.name, type: this.type })
    return null
  }

  return this._timer.duration()
}

Span.prototype.offsetTime = function () {
  if (!this.started) {
    this._agent.logger.debug('tried to call span.offsetTime() for un-started span %o', { id: this.transaction.id, name: this.name, type: this.type })
    return null
  }

  return this._timer.offset(this.transaction._timer)
}

Span.prototype.setDbContext = function (context) {
  if (!context) return
  this._db = Object.assign(this._db || {}, context)
}

Span.prototype._recordStackTrace = function (obj) {
  if (!obj) {
    obj = {}
    Error.captureStackTrace(obj, Span.prototype.start)
  }

  var self = this

  // NOTE: This uses a promise-like thing and not a *real* promise
  // because passing error stacks into a promise context makes it
  // uncollectable by the garbage collector.
  var stack = new Value()
  this._stackObj = stack

  // TODO: This is expensive! Consider if there's a way to cache some of this
  stackman.callsites(obj, function (err, callsites) {
    if (err || !callsites) {
      self._agent.logger.debug('could not capture stack trace for span %o', { id: self.transaction.id, name: self.name, type: self.type, err: err && err.message })
      stack.reject(err)
      return
    }

    if (!TEST) callsites = callsites.filter(filterCallsite)

    var next = afterAll((err, res) => {
      err ? stack.reject(err) : stack.resolve(res)
    })

    callsites.forEach(function (callsite) {
      parsers.parseCallsite(callsite, false, self._agent, next())
    })
  })
}

Span.prototype._encode = function (cb) {
  var self = this

  if (!this.started) return cb(new Error('cannot encode un-started span'))
  if (!this.ended) return cb(new Error('cannot encode un-ended span'))

  if (this._agent._conf.captureSpanStackTraces && this._stackObj) {
    this._stackObj.then(
      value => done(null, value),
      error => done(error)
    )
  } else {
    process.nextTick(done)
  }

  function done (err, frames) {
    if (err) {
      self._agent.logger.warn('could not capture stack trace for span %o', { id: self.transaction.id, name: self.name, type: self.type, err: err.message })
    }

    var payload = {
      name: self.name,
      type: self.truncated ? self.type + '.truncated' : self.type,
      start: self.offsetTime(),
      duration: self.duration()
    }

    if (frames) payload.stacktrace = frames
    if (self._db) payload.context = { db: self._db }

    cb(null, payload)
  }
}

function filterCallsite (callsite) {
  var filename = callsite.getFileName()
  return filename ? filename.indexOf('/node_modules/elastic-apm-node/') === -1 : true
}
