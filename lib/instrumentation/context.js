const crypto = require('crypto')

function fromHex (hex) {
  return Buffer.from(hex, 'hex')
}

function toHex (buffer) {
  return buffer.toString('hex')
}

class TraceContext {
  constructor (opts = {}) {
    // 1 byte
    this.version = opts.version
    // 16 bytes
    this.traceId = opts.traceId
    // 8 bytes
    this.id = opts.id
    // 1 byte
    this.flags = opts.flags
    // 8 bytes
    this.parentId = opts.parentId
  }

  static create () {
    const bytes = crypto.randomBytes(24)

    return new TraceContext({
      version: Buffer.alloc(1),
      traceId: bytes.slice(0, 16),
      id: bytes.slice(16),
      flags: Buffer.alloc(1)
    })
  }

  static fromString (header) {
    const [
      version,
      traceId,
      id,
      flags
    ] = header.split('-').map(fromHex)

    return new TraceContext({
      version,
      traceId,
      id,
      flags
    })
  }

  child () {
    const { version, traceId, id: parentId, flags } = this
    const id = crypto.randomBytes(8)

    return new TraceContext({
      version,
      traceId,
      id,
      flags,
      parentId
    })
  }

  toString () {
    const parts = [
      this.version,
      this.traceId,
      this.id,
      this.flags
    ]

    return parts.map(toHex).join('-')
  }

  toJSON () {
    return {
      version: this.version.toString('hex'),
      traceId: this.traceId.toString('hex'),
      id: this.id.toString('hex'),
      flags: this.flags.toString('hex'),
      parentId: this.parentId && this.parentId.toString('hex')
    }
  }
}

module.exports = TraceContext
