'use strict'

// Utilities to wrap properties of an object.
//
// This is similar to "./instrumentation/shimmer.js". However, it uses a
// different technique to support wrapping properties that are only available
// via a getter (i.e. their property descriptor is `.writable === false`).

// This block is derived from esbuild's bundling support.
// https://github.com/evanw/esbuild/blob/v0.14.42/internal/runtime/runtime.go#L22
var __defProp = Object.defineProperty
var __getOwnPropDesc = Object.getOwnPropertyDescriptor
var __hasOwnProp = Object.prototype.hasOwnProperty
var __getOwnPropNames = Object.getOwnPropertyNames
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (const key of __getOwnPropNames(from)) {
      if (!__hasOwnProp.call(to, key) && key !== except) {
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable })
      }
    }
  }
  return to
}

/**
 * Return a new object that is a copy of `obj`, with its `subpath` property
 * replaced with the return value of `wrapper(original)`.
 *
 * For example:
 *    var os = wrap(require('os'), 'platform', (orig) => {
 *      return function wrappedPlatform () {
 *        return orig().toUpperCase()
 *      }
 *    })
 *    console.log(os.platform()) // => DARWIN
 *
 * The subpath can indicate a nested property. Each property in that subpath,
 * except the last, much identify an *Object*.
 *
 * Limitations:
 * - This doesn't handle possible Symbol properties on the copied object(s).
 * - This cannot wrap a property of a function, because we cannot create a
 *   copy of the function.
 *
 * @param {Object} obj
 * @param {String} subpath - The property subpath on `obj` to wrap. This may
 *    point to a nested property by using a '.' to separate levels. For example:
 *        var fs = wrap(fs, 'promises.sync', (orig) => { ... })
 * @param {Function} wrapper - A function of the form `function (orig)`, where
 *    `orig` is the original property value. This must synchronously return the
 *    new property value.
 * @returns {Object} A new object with the wrapped property.
 * @throws {TypeError} if the subpath points to a non-existant property, or if
 *    any but the last subpath part points to a non-Object.
 */
function wrap (obj, subpath, wrapper) {
  const parts = subpath.split('.')
  const namespaces = [obj]
  let namespace = obj
  let key
  let val

  // 1. Traverse the subpath parts to sanity check and build up the Objects
  //    that we will be copying at least level into `namespaces`.
  for (let i = 0; i < parts.length; i++) {
    key = parts[i]
    val = namespace[key]
    if (!val) {
      throw new TypeError(`cannot wrap "${subpath}": "<obj>.${parts.slice(0, i).join('.')}" is ${typeof val}`)
    } else if (i < parts.length - 1) {
      if (typeof val !== 'object') {
        throw new TypeError(`cannot wrap "${subpath}": "<obj>.${parts.slice(0, i).join('.')}" is not an Object`)
      }
      namespace = val
      namespaces.push(namespace)
    }
  }

  // 2. Now work backwards, wrapping each namespace with a new object that has a
  //    copy of all the properties, except the one that we've wrapped.
  for (let i = parts.length - 1; i >= 0; i--) {
    key = parts[i]
    namespace = namespaces[i]
    if (i === parts.length - 1) {
      const orig = namespace[key]
      val = wrapper(orig)
    } else {
      val = namespaces[i + 1]
    }
    const desc = __getOwnPropDesc(namespace, key)
    const wrappedNamespace = __defProp({}, key, {
      value: val,
      enumerable: !desc || desc.enumerable
    })
    __copyProps(wrappedNamespace, namespace, key)
    namespaces[i] = wrappedNamespace
  }

  return namespaces[0]
}

module.exports = {
  wrap
}
