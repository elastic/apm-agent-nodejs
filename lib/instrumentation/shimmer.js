'use strict'

/**
 * This file is extracted from the 'shimmer' project copyright by Forrest L
 * Norvell. It have been modified slightly to be used in the current context.
 *
 * https://github.com/othiym23/shimmer
 *
 * Original file:
 *
 * https://github.com/othiym23/shimmer/blob/master/index.js
 *
 * License:
 *
 * BSD-2-Clause, http://opensource.org/licenses/BSD-2-Clause
 */

var agent = require('../../')

var symbols = require('../symbols')

var isWrappedSym = Symbol('elasticAPMIsWrapped')

exports.wrap = wrap
exports.massWrap = massWrap
exports.unwrap = unwrap

function isFunction (funktion) {
  return funktion && {}.toString.call(funktion) === '[object Function]'
}

function wrap (nodule, name, wrapper) {
  if (!nodule || !nodule[name]) {
    agent.logger.debug('no original function %s to wrap', name)
    return
  }

  if (!wrapper) {
    agent.logger.debug('no wrapper function')
    agent.logger.debug((new Error()).stack)
    return
  }

  if (!isFunction(nodule[name]) || !isFunction(wrapper)) {
    agent.logger.debug('original object and wrapper must be functions')
    return
  }

  if (nodule[name][isWrappedSym]) {
    agent.logger.debug('function %s already wrapped', name)
    return
  }

  var original = nodule[name]
  var wrapped = wrapper(original, name)

  wrapped[isWrappedSym] = true
  wrapped[symbols.unwrap] = function elasticAPMUnwrap () {
    if (nodule[name] === wrapped) {
      nodule[name] = original
      wrapped[isWrappedSym] = false
    }
  }

  nodule[name] = wrapped

  return wrapped
}

function massWrap (nodules, names, wrapper) {
  if (!nodules) {
    agent.logger.debug('must provide one or more modules to patch')
    agent.logger.debug((new Error()).stack)
    return
  } else if (!Array.isArray(nodules)) {
    nodules = [nodules]
  }

  if (!(names && Array.isArray(names))) {
    agent.logger.debug('must provide one or more functions to wrap on modules')
    return
  }

  nodules.forEach(function (nodule) {
    names.forEach(function (name) {
      wrap(nodule, name, wrapper)
    })
  })
}

function unwrap (nodule, name) {
  if (!nodule || !nodule[name]) {
    agent.logger.debug('no function to unwrap.')
    agent.logger.debug((new Error()).stack)
    return
  }

  if (!nodule[name][symbols.unwrap]) {
    agent.logger.debug('no original to unwrap to -- has %s already been unwrapped?', name)
  } else {
    return nodule[name][symbols.unwrap]()
  }
}
