/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const Module = require('module')
const resolve = require('resolve')
const debug = require('debug')('require-in-the-middle')

module.exports = Hook

/**
 * Is the given module a "core" module?
 * https://nodejs.org/api/modules.html#core-modules
 *
 * @type {(moduleName: string) => boolean}
 */
let isCore
if (Module.isBuiltin) { // as of node v18.6.0
  isCore = Module.isBuiltin
} else {
  isCore = moduleName => {
    // Prefer `resolve.core` lookup to `resolve.isCore(moduleName)` because the
    // latter is doing version range matches for every call.
    return !!resolve.core[moduleName]
  }
}

// 'foo/bar.js' or 'foo/bar/index.js' => 'foo/bar'
const normalize = /([/\\]index)?(\.js)?$/

/**
 * findModuleDetails returns an object with some module details for the given
 * `filename` that is being `require`d; or it returns `null`.
 *
 * @param {string} filename - The absolute path of the file being loaded, e.g.
 *    '/home/foo/node_modules/amodule/some/subfile.js'
 * @returns {Object | null}
 *    {
 *      name: '<the module name>',                  // e.g. 'amodule', '@anamespace/amodule'
 *      basedir: '<root dir of the module>',        // e.g. '/home/foo/node_modules/amodule'
 *      path: '<subpath under the module basedir>', // e.g. 'some/subfile.js'
 *    }
 */
function findModuleDetails (filename) {
  let name
  const segments = filename.split(path.sep)
  let index

  // First attempt the fast path of looking for a `node_modules` dir in the path.
  index = segments.lastIndexOf('node_modules')
  if (index !== -1) {
    if (!segments[index + 1]) {
      return null
    }
    const scoped = segments[index + 1][0] === '@'
    name = scoped ? segments[index + 1] + '/' + segments[index + 2] : segments[index + 1]
    const offset = scoped ? 3 : 2
    return {
      name,
      basedir: segments.slice(0, index + offset).join(path.sep),
      path: segments.slice(index + offset).join(path.sep)
    }
  }

  // Second, fallback to looking for a directory with a "package.json" file.
  const startDir = path.dirname(filename)
  index = -1
  const { root } = path.parse(startDir)
  let dir = startDir
  let pj
  while (true) {
    pj = path.resolve(dir, 'package.json')
    if (fs.existsSync(pj)) {
      break
    }
    if (dir === root) {
      return null // No package.json found.
    }
    dir = path.dirname(dir)
    index -= 1
  }
  try {
    const data = JSON.parse(fs.readFileSync(pj))
    if (data.name) {
      // Do the same "name" trimming as
      // https://github.com/npm/normalize-package-data#what-normalization-currently-entails
      name = data.name.trim()
    }
  } catch (_err) {
    return null // Error loading the found "package.json".
  }
  if (name) {
    return {
      name,
      basedir: dir,
      path: segments.slice(index).join(path.sep)
    }
  }
}

function Hook (modules, options, onrequire) {
  if ((this instanceof Hook) === false) return new Hook(modules, options, onrequire)
  if (typeof modules === 'function') {
    onrequire = modules
    modules = null
    options = null
  } else if (typeof options === 'function') {
    onrequire = options
    options = null
  }

  if (typeof Module._resolveFilename !== 'function') {
    console.error('Error: Expected Module._resolveFilename to be a function (was: %s) - aborting!', typeof Module._resolveFilename)
    console.error('Please report this error as an issue related to Node.js %s at %s', process.version, require('./package.json').bugs.url)
    return
  }

  this.cache = new Map()
  this._unhooked = false
  this._origRequire = Module.prototype.require

  const self = this
  const patching = new Set()
  const internals = options ? options.internals === true : false
  const hasWhitelist = Array.isArray(modules)

  debug('registering require hook')

  this._require = Module.prototype.require = function (id) {
    if (self._unhooked === true) {
      // if the patched require function could not be removed because
      // someone else patched it after it was patched here, we just
      // abort and pass the request onwards to the original require
      debug('ignoring require call - module is soft-unhooked')
      return self._origRequire.apply(this, arguments)
    }

    const core = isCore(id)
    let filename // the string used for caching
    if (core) {
      filename = id
      // If this is a builtin module that can be identified both as 'foo' and
      // 'node:foo', then prefer 'foo' as the caching key.
      if (id.startsWith('node:')) {
        const idWithoutPrefix = id.slice(5)
        if (isCore(idWithoutPrefix)) {
          filename = idWithoutPrefix
        }
      }
    } else {
      try {
        filename = Module._resolveFilename(id, this)
      } catch (resolveErr) {
        // If someone *else* monkey-patches before this monkey-patch, then that
        // code might expect `require(someId)` to get through so it can be
        // handled, even if `someId` cannot be resolved to a filename. In this
        // case, instead of throwing we defer to the underlying `require`.
        //
        // For example the Azure Functions Node.js worker module does this,
        // where `@azure/functions-core` resolves to an internal object.
        // https://github.com/Azure/azure-functions-nodejs-worker/blob/v3.5.2/src/setupCoreModule.ts#L46-L54
        debug(`Module._resolveFilename(${id}) threw "${resolveErr.message}", calling original Module.require`)
        console.log('XXX ritm: Module._resolveFilename("%s") errored, calling original Module.require', id, resolveErr)
        return self._origRequire.apply(this, arguments)
      }
    }

    let moduleName, basedir

    debug('processing %s module require(\'%s\'): %s', core === true ? 'core' : 'non-core', id, filename)

    // return known patched modules immediately
    if (self.cache.has(filename) === true) {
      debug('returning already patched cached module: %s', filename)
      return self.cache.get(filename)
    }

    // Check if this module has a patcher in-progress already.
    // Otherwise, mark this module as patching in-progress.
    const isPatching = patching.has(filename)
    if (isPatching === false) {
      patching.add(filename)
    }

    const exports = self._origRequire.apply(this, arguments)

    // If it's already patched, just return it as-is.
    if (isPatching === true) {
      debug('module is in the process of being patched already - ignoring: %s', filename)
      return exports
    }

    // The module has already been loaded,
    // so the patching mark can be cleaned up.
    patching.delete(filename)

    if (core === true) {
      if (hasWhitelist === true && modules.includes(filename) === false) {
        debug('ignoring core module not on whitelist: %s', filename)
        return exports // abort if module name isn't on whitelist
      }
      moduleName = filename
    } else if (hasWhitelist === true && modules.includes(filename)) {
      // whitelist includes the absolute path to the file including extension
      const parsedPath = path.parse(filename)
      moduleName = parsedPath.name
      basedir = parsedPath.dir
    } else {
      // XXX stat and 'parse' are misleading names -> {name, basedir, path}
      const stat = findModuleDetails(filename)
      if (!stat) {
        debug('could not parse filename: %s', filename)
        return exports // abort if filename could not be parsed
      }
      moduleName = stat.name
      basedir = stat.basedir

      const fullModuleName = resolveModuleName(stat)

      debug('resolved filename to module: %s (id: %s, resolved: %s, basedir: %s)', moduleName, id, fullModuleName, basedir)

      // Ex: require('foo/lib/../bar.js')
      // moduleName = 'foo'
      // fullModuleName = 'foo/bar'
      if (hasWhitelist === true && modules.includes(moduleName) === false) {
        if (modules.includes(fullModuleName) === false) return exports // abort if module name isn't on whitelist

        // if we get to this point, it means that we're requiring a whitelisted sub-module
        moduleName = fullModuleName
      } else {
        // figure out if this is the main module file, or a file inside the module
        let res
        try {
          res = resolve.sync(moduleName, { basedir })
        } catch (e) {
          debug('could not resolve module: %s', moduleName)
          return exports // abort if module could not be resolved (e.g. no main in package.json and no index.js file)
        }

        if (res !== filename) {
          // this is a module-internal file
          if (internals === true) {
            // use the module-relative path to the file, prefixed by original module name
            moduleName = moduleName + path.sep + path.relative(basedir, filename)
            debug('preparing to process require of internal file: %s', moduleName)
          } else {
            debug('ignoring require of non-main module file: %s', res)
            return exports // abort if not main module file
          }
        }
      }
    }

    // only call onrequire the first time a module is loaded
    if (self.cache.has(filename) === false) {
      // ensure that the cache entry is assigned a value before calling
      // onrequire, in case calling onrequire requires the same module.
      self.cache.set(filename, exports)
      debug('calling require hook: %s', moduleName)
      self.cache.set(filename, onrequire(exports, moduleName, basedir))
    }

    debug('returning module: %s', moduleName)
    return self.cache.get(filename)
  }
}

Hook.prototype.unhook = function () {
  this._unhooked = true
  if (this._require === Module.prototype.require) {
    Module.prototype.require = this._origRequire
    debug('unhook successful')
  } else {
    debug('unhook unsuccessful')
  }
}

function resolveModuleName (stat) {
  const normalizedPath = path.sep !== '/' ? stat.path.split(path.sep).join('/') : stat.path
  return path.posix.join(stat.name, normalizedPath).replace(normalize, '')
}
