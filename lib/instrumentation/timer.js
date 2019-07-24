'use strict'

var microtime = require('relative-microtime')

function maybeTime (timer, time) {
  if (timer._parent) return maybeTime(timer._parent, time)
  return time >= 0 ? time * 1000 : timer._timer()
}

module.exports = class Timer {
  // `startTime`: millisecond float
  constructor (timer, startTime) {
    this._parent = timer
    this._timer = timer ? timer._timer : microtime()
    this.start = maybeTime(this, startTime) // microsecond integer
    this.duration = null // millisecond float
    this.selfTime = null // millisecond float

    // Track child timings to produce self-time
    this.activeChildren = 0
    this.childStart = 0
    this.childDuration = 0

    if (this._parent) {
      this._parent.startChild(startTime)
    }
  }

  startChild (startTime) {
    if (++this.activeChildren === 1) {
      this.childStart = maybeTime(this, startTime)
    }
  }

  endChild (endTime) {
    if (--this.activeChildren === 0) {
      this.incrementChildDuration(endTime)
    }
  }

  incrementChildDuration (endTime) {
    this.childDuration += (maybeTime(this, endTime) - this.childStart) / 1000
    this.childStart = 0
  }

  // `endTime`: millisecond float
  end (endTime) {
    if (this.duration !== null) return
    this.duration = this.elapsed(endTime)
    if (this.activeChildren) {
      this.incrementChildDuration(endTime)
    }
    this.selfTime = this.duration - this.childDuration
    if (this._parent) {
      this._parent.endChild(endTime)
    }
  }

  // `endTime`: millisecond float
  // returns: millisecond float
  elapsed (endTime) {
    return (maybeTime(this, endTime) - this.start) / 1000
  }
}
