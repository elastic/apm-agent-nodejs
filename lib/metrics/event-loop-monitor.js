'use strict'

function toNano (t) {
  return (t[0] * 1e9) + t[1]
}

function sumReducer (last, next) {
  return last + next
}

function descriptor (target, property, data) {
  Object.defineProperty(target, property, data)
}

function define (target, property, value) {
  descriptor(target, property, { value })
}

class EventLoopDelayHistogram extends Array {
  constructor ({ resolution = 10 } = {}) {
    super()

    define(this, 'resolution', resolution)
    descriptor(this, 'timer', { writable: true })
  }

  get stddev () {
    const avg = this.mean

    const squareDiffs = this.map(value => {
      const diff = value - avg
      const sqrDiff = diff * diff
      return sqrDiff
    })

    return Math.sqrt(squareDiffs.mean)
  }

  get mean () {
    return this.reduce(sumReducer, 0) / this.length
  }

  get min () {
    return Math.min(...this)
  }

  get max () {
    return Math.max(...this)
  }

  enable () {
    if (this.timer) return false

    let last = process.hrtime()

    this.timer = setInterval(() => {
      const next = process.hrtime(last)
      this.push(Math.max(0, toNano(next)))
      last = process.hrtime()
    }, this.resolution)

    this.timer.unref()

    return true
  }

  disable () {
    if (!this.timer) return false
    clearInterval(this.timer)
    return true
  }

  reset () {
    while (this.length) {
      this.shift()
    }
  }
}

const proto = EventLoopDelayHistogram.prototype
descriptor(proto, 'stddev', { enumerable: true })
descriptor(proto, 'mean', { enumerable: true })
descriptor(proto, 'min', { enumerable: true })
descriptor(proto, 'max', { enumerable: true })

module.exports = EventLoopDelayHistogram
