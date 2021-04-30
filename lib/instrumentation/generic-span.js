'use strict'

const truncate = require('unicode-byte-truncate')

const config = require('../config')
const constants = require('../constants')
const Timer = require('./timer')
const TraceContext = require('../tracecontext')
module.exports = GenericSpan

function GenericSpan (agent, ...args) {
  const opts = typeof args[args.length - 1] === 'object'
    ? (args.pop() || {})
    : {}

  this._timer = new Timer(opts.timer, opts.startTime)

  // _context is used by the OT bridge, and should unfortunately therefore be considered public
  this._context = TraceContext.startOrResume(opts.childOf, agent._conf, opts.tracestate)

  this._agent = agent
  this._labels = null
  this._ids = null // Populated by sub-types of GenericSpan

  this.timestamp = this._timer.start
  this.ended = false
  this.sync = true

  this.outcome = constants.OUTCOME_UNKNOWN

  // Freezing the outcome allows us to prefer a value set from
  // from the API and allows a span to keep its unknown status
  // even if it succesfully ends.
  this._isOutcomeFrozen = false

  this.type = null
  this.subtype = null
  this.action = null
  this.setType(...args)
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

Object.defineProperty(GenericSpan.prototype, 'sampleRate', {
  enumerable: true,
  get () {
    const rate = parseFloat(this._context.tracestate.getValue('s'))
    if (rate >= 0 && rate <= 1) {
      return rate
    }
    return null
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

// The 'stringify' option is for backward compatibility and will likely be
// removed in the next major version.
GenericSpan.prototype.setLabel = function (key, value, stringify = true) {
  const makeLabelValue = () => {
    if (!stringify && (typeof value === 'boolean' || typeof value === 'number')) {
      return value
    }

    return truncate(String(value), config.INTAKE_STRING_MAX_SIZE)
  }

  if (!key) return false
  if (!this._labels) this._labels = {}
  var skey = key.replace(/[.*"]/g, '_')
  if (key !== skey) {
    this._agent.logger.warn('Illegal characters used in tag key: %s', key)
  }
  this._labels[skey] = makeLabelValue()
  return true
}

GenericSpan.prototype.addLabels = function (labels, stringify) {
  if (!labels) return false
  var keys = Object.keys(labels)
  for (const key of keys) {
    if (!this.setLabel(key, labels[key], stringify)) {
      return false
    }
  }
  return true
}

GenericSpan.prototype.setType = function (type = null, subtype = null, action = null) {
  this.type = type
  this.subtype = subtype
  this.action = action
}

GenericSpan.prototype._freezeOutcome = function () {
  this._isOutcomeFrozen = true
}

GenericSpan.prototype._isValidOutcome = function (outcome) {
  return outcome === constants.OUTCOME_FAILURE ||
    outcome === constants.OUTCOME_SUCCESS ||
    outcome === constants.OUTCOME_UNKNOWN
}
