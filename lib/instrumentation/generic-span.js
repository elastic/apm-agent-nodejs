'use strict'

const truncate = require('unicode-byte-truncate')

const config = require('../config')
const Timer = require('./timer')
const TraceContext = require('./trace-context')

module.exports = GenericSpan

function GenericSpan (agent, type, opts) {
  this._timer = new Timer(opts.timer, opts.startTime)
  this._context = opts.traceContext
    ? opts.traceContext.child()
    : TraceContext.startOrResume(opts.traceparent, agent._conf)
  this._agent = agent
  this._tags = null

  this.timestamp = this._timer.start
  this.type = type || 'custom'
  this.ended = false
}

Object.defineProperty(GenericSpan.prototype, 'id', {
  enumerable: true,
  get () {
    return this._context.id
  }
})

Object.defineProperty(GenericSpan.prototype, 'traceId', {
  enumerable: true,
  get () {
    return this._context.traceId
  }
})

Object.defineProperty(GenericSpan.prototype, 'parentId', {
  enumerable: true,
  get () {
    return this._context.parentId
  }
})

Object.defineProperty(GenericSpan.prototype, 'sampled', {
  enumerable: true,
  get () {
    return this._context.sampled
  }
})

GenericSpan.prototype.duration = function () {
  if (!this.ended) {
    this._agent.logger.debug('tried to call duration() on un-ended transaction/span %o', { id: this.id, parent: this.parentId, trace: this.traceId, name: this.name, type: this.type })
    return null
  }

  return this._timer.duration
}

GenericSpan.prototype.setTag = function (key, value) {
  if (!key) return false
  if (!this._tags) this._tags = {}
  var skey = key.replace(/[.*"]/g, '_')
  if (key !== skey) {
    this._agent.logger.warn('Illegal characters used in tag key: %s', key)
  }
  this._tags[skey] = truncate(String(value), config.INTAKE_STRING_MAX_SIZE)
  return true
}

GenericSpan.prototype.addTags = function (tags) {
  if (!tags) return false
  var keys = Object.keys(tags)
  for (let key of keys) {
    if (!this.setTag(key, tags[key])) {
      return false
    }
  }
  return true
}
