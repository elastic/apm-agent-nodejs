'use strict'

const { RunContext } = require('../instrumentation/run-context')

// XXX
// Implements interface Context from:
// https://github.com/open-telemetry/opentelemetry-js-api/blob/v1.0.4/src/context/types.ts#L17
class OTelBridgeRunContext extends RunContext {
  toString () {
    return `<OTelBridgeRunContext: ${super.toString()}>` // XXX
  }

  // // noop
  // getValue (key) {
  //   console.log('XXX OTelContext.getValue(%o)', key)
  //   return undefined
  // }

  // setValue (key, value) {
  //   console.log('XXX OTelContext.setValue(%o, %s)', key, value)
  //   return this
  // }

  // deleteValue (key) {
  //   console.log('XXX OTelContext.deleteValue(%o)', key)
  //   return this
  // }

  // constructor (fields) {
  //   this._fields = fields ? new Map(fields) : new Map()
  // }

  // toString () {
  //   return `<OTelContext: keys=${this._fields.keys().toString()}>`
  // }

  // getValue (key) {
  //   console.log('XXX OTelContext.getValue(%o)', key)
  //   return this._fields.get(key)
  // }

  // setValue (key, value) {
  //   console.log('XXX OTelContext.setValue(%o, %s)', key, value)
  //   const otelContext = new OTelContext(this._fields)
  //   otelContext._fields.set(key, value)
  //   return otelContext
  // }

  // deleteValue (key) {
  //   console.log('XXX OTelContext.deleteValue(%o)', key)
  //   const otelContext = new OTelContext(this._fields)
  //   otelContext._fields.delete(key)
  //   return otelContext
  // }

  // XXX
  // /**
  //  * Get a value from the context.
  //  *
  //  * @param key key which identifies a context value
  //  */
  //  getValue(key: symbol): unknown;

  //  /**
  //   * Create a new context which inherits from this context and has
  //   * the given key set to the given value.
  //   *
  //   * @param key context key for which to set the value
  //   * @param value value to set for the given key
  //   */
  //  setValue(key: symbol, value: unknown): Context;

  //  /**
  //   * Return a new context which inherits from this context but does
  //   * not contain a value for the given key.
  //   *
  //   * @param key context key for which to clear a value
  //   */
  //  deleteValue(key: symbol): Context;
}

module.exports = {
  OTelBridgeRunContext
}
