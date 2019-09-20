'use strict'

const truncate = require('unicode-byte-truncate')

const config = require('../config')
const Timer = require('./timer')
const TraceParent = require('traceparent')

module.exports = GenericSpan

function GenericSpan (agent, type, opts) {
  this._timer = new Timer(opts.timer, opts.startTime)
  this._context = TraceParent.startOrResume(opts.childOf, agent._conf) // _context is used by the OT bridge, and should unfortunately therefore be considered public
  this._agent = agent
  this._labels = null

  this.timestamp = this._timer.start
  this.type = type || 'custom'
  this.ended = false
  this.sync = true
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
    return this._context.recorded
  }
})

Object.defineProperty(GenericSpan.prototype, 'traceparent', {
  enumerable: true,
  get () {
    return this._context.toString()
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
  if (!this.setTag._deprecatedLogged) {
    this.setTag._deprecatedLogged = true
    this._agent.logger.warn(`Called deprecated method: ${this.constructor.name.toLowerCase()}.setTag(...)`)
  }
  return this.setLabel(key, value)
}

GenericSpan.prototype.setLabel = function (key, value) {
  if (!key) return false
  if (!this._labels) this._labels = {}
  var skey = key.replace(/[.*"]/g, '_')
  if (key !== skey) {
    this._agent.logger.warn('Illegal characters used in tag key: %s', key)
  }
  this._labels[skey] = truncate(String(value), config.INTAKE_STRING_MAX_SIZE)
  return true
}

GenericSpan.prototype.addTags = function (tags) {
  if (!this.addTags._deprecatedLogged) {
    this.addTags._deprecatedLogged = true
    this._agent.logger.warn(`Called deprecated method: ${this.constructor.name.toLowerCase()}.addTags(...)`)
  }
  return this.addLabels(tags)
}

GenericSpan.prototype.addLabels = function (labels) {
  if (!labels) return false
  var keys = Object.keys(labels)
  for (const key of keys) {
    if (!this.setLabel(key, labels[key])) {
      return false
    }
  }
  return true
}
