/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var fs = require('fs');
var path = require('path');

const { Hook: RitmHook } = require('require-in-the-middle');
const IitmHook = require('import-in-the-middle');
const semver = require('semver');

const {
  CONTEXT_MANAGER_ASYNCHOOKS,
  CONTEXT_MANAGER_ASYNCLOCALSTORAGE,
} = require('../config/schema');
var { Ids } = require('./ids');
var Transaction = require('./transaction');
var { NoopTransaction } = require('./noop-transaction');
const {
  AsyncHooksRunContextManager,
  AsyncLocalStorageRunContextManager,
} = require('./run-context');
const { getLambdaHandlerInfo } = require('../lambda');
const undiciInstr = require('./modules/undici');
const azureFunctionsInstr = require('./azure-functions');

const nodeSupportsAsyncLocalStorage = semver.satisfies(
  process.versions.node,
  '>=14.5 || ^12.19.0',
);
// Node v16.5.0 added fetch support (behind `--experimental-fetch` until
// v18.0.0) based on undici@5.0.0. We can instrument undici >=v4.7.1.
const nodeHasInstrumentableFetch = typeof global.fetch === 'function';

var MODULE_PATCHERS = [
  { modPath: '@apollo/server' },
  { modPath: '@smithy/smithy-client' }, // Instrument the base client which all AWS-SDK v3 clients extend.
  {
    modPath: '@aws-sdk/smithy-client',
    patcher: './modules/@smithy/smithy-client.js',
  },
  { modPath: '@elastic/elasticsearch' },
  {
    modPath: '@elastic/elasticsearch-canary',
    patcher: './modules/@elastic/elasticsearch.js',
  },
  { modPath: '@opentelemetry/api' },
  { modPath: '@opentelemetry/sdk-metrics' },
  { modPath: '@redis/client/dist/lib/client/index.js', diKey: 'redis' },
  {
    modPath: '@redis/client/dist/lib/client/commands-queue.js',
    diKey: 'redis',
  },
  {
    modPath: '@node-redis/client/dist/lib/client/index.js',
    patcher: './modules/@redis/client/dist/lib/client/index.js',
    diKey: 'redis',
  },
  {
    modPath: '@node-redis/client/dist/lib/client/commands-queue.js',
    patcher: './modules/@redis/client/dist/lib/client/commands-queue.js',
    diKey: 'redis',
  },
  { modPath: 'apollo-server-core' },
  { modPath: 'aws-sdk' },
  { modPath: 'bluebird' },
  { modPath: 'cassandra-driver' },
  { modPath: 'elasticsearch' },
  { modPath: 'express' },
  { modPath: 'express-graphql' },
  { modPath: 'express-queue' },
  { modPath: 'fastify' },
  { modPath: 'finalhandler' },
  { modPath: 'generic-pool' },
  { modPath: 'graphql' },
  { modPath: 'handlebars' },
  { modPath: '@hapi/hapi' },
  { modPath: 'http' },
  { modPath: 'https' },
  { modPath: 'http2' },
  { modPath: 'ioredis' },
  { modPath: 'jade' },
  { modPath: 'knex' },
  { modPath: 'koa' },
  { modPath: 'koa-router' },
  { modPath: '@koa/router', patcher: './modules/koa-router.js' },
  { modPath: 'memcached' },
  { modPath: 'mimic-response' },
  { modPath: 'mongodb-core' },
  { modPath: 'mongodb' },
  { modPath: 'mysql' },
  { modPath: 'mysql2' },
  { modPath: 'next' },
  { modPath: 'next/dist/server/api-utils/node.js' },
  { modPath: 'next/dist/server/dev/next-dev-server.js' },
  { modPath: 'next/dist/server/next-server.js' },
  { modPath: 'pg' },
  { modPath: 'pug' },
  { modPath: 'redis' },
  { modPath: 'restify' },
  { modPath: 'tedious' },
  { modPath: 'undici' },
  { modPath: 'ws' },
];

/**
 * This is a subset of `MODULES` until ESM support for all is tested.
 *
 * @typedef {Object} IitmModuleInfo
 * @property {boolean} [instrumentImportMod] If false, this indicates that
 *    the instrumentation for this module should be passed the
 *    `modExports.default` property instead of the `modExports`. For
 *    instrumentation of CommonJS modules that do not modify top-level
 *    exports, this generally means the instrumentation can remain unchanged.
 *    See the handling of the `default` property at
 *    https://nodejs.org/api/esm.html#commonjs-namespaces
 *
 * @type {Map<string, IitmModuleInfo>}
 */
const IITM_MODULES = {
  // This smithy-client entry isn't used for `@aws-sdk/client-*` ESM support
  // because the smithy-client is transitively `require`d by CommonJS aws-sdk
  // code. If a future aws-sdk v3 version switches to ESM imports internally,
  // then this will be relevant.
  //  '@aws-sdk/smithy-client': { instrumentImportMod: false },
  'cassandra-driver': { instrumentImportMod: false },
  express: { instrumentImportMod: false },
  fastify: { instrumentImportMod: true },
  http: { instrumentImportMod: true },
  https: { instrumentImportMod: true },
  ioredis: { instrumentImportMod: false },
  knex: { instrumentImportMod: false },
  pg: { instrumentImportMod: false },
};

/**
 * modPath                            modName
 * -------                            ---------
 * mongodb                            mongodb
 * mongodb/lib/foo.js                 mongodb
 * @elastic/elasticsearch             @elastic/elasticsearch
 * @redis/client/dist/lib/client.js   @redis/client
 * /var/task/index.js                 /var/task/index.js
 */
function modNameFromModPath(modPath) {
  if (modPath.startsWith('/')) {
    return modPath;
  } else if (modPath.startsWith('@')) {
    return modPath.split('/', 2).join('/');
  } else {
    return modPath.split('/', 1)[0];
  }
}

/**
 * Holds the registered set of "patchers" (functions that monkey patch imported
 * modules) for a module path (`modPath`).
 */
class PatcherRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    this._infoFromModPath = {};
  }

  /**
   * Add a patcher for the given module path.
   *
   * @param {string} modPath - Identifies a module that RITM can hook: a
   *    module name (http, @smithy/client), a module-relative path
   *    (mongodb/lib/cmap/connection_pool.js), an absolute path
   *    (/var/task/index.js; Windows paths are not supported), a sub-module
   *    (react-dom/server).
   * @param {import('../..').PatchHandler | string} patcher - A patcher function
   *    or a path to a CommonJS module that exports one as the default export.
   * @param {string} [diKey] - An optional key in the `disableInstrumentations`
   *    config var that is used to determine if this patcher is
   *    disabled. All patchers for the same modPath must share the same `diKey`.
   *    This throws if a conflicting `diKey` is given.
   *    It defaults to the `modName` (derived from the `modPath`).
   */
  add(modPath, patcher, diKey = null) {
    if (!(modPath in this._infoFromModPath)) {
      this._infoFromModPath[modPath] = {
        patchers: [patcher],
        diKey: diKey || modNameFromModPath(modPath),
      };
    } else {
      const entry = this._infoFromModPath[modPath];
      // The `diKey`, if provided, must be the same for all patchers for a modPath.
      if (diKey && diKey !== entry.diKey) {
        throw new Error(
          `invalid "diKey", ${diKey}, for module "${modPath}" patcher: it conflicts with existing diKey=${entry.diKey}`,
        );
      }
      entry.patchers.push(patcher);
    }
  }

  /**
   * Remove the given patcher for the given module path.
   */
  remove(modPath, patcher) {
    const entry = this._infoFromModPath[modPath];
    if (!entry) {
      return;
    }
    const idx = entry.patchers.indexOf(patcher);
    if (idx !== -1) {
      entry.patchers.splice(idx, 1);
    }
    if (entry.patchers.length === 0) {
      delete this._infoFromModPath[modPath];
    }
  }

  /**
   * Remove all patchers for the given module path.
   */
  clear(modPath) {
    delete this._infoFromModPath[modPath];
  }

  has(modPath) {
    return modPath in this._infoFromModPath;
  }

  getPatchers(modPath) {
    return this._infoFromModPath[modPath]?.patchers;
  }

  /**
   * Returns the appropriate RITM `modules` argument so that all registered
   * `modPath`s will be hooked. This assumes `{internals: true}` RITM options
   * are used.
   *
   * @returns {Array<string>}
   */
  ritmModulesArg() {
    // RITM hooks:
    // 1. `require('mongodb')` if 'mongodb' is in the modules arg;
    // 2. `require('mongodb/lib/foo.js')`, a module-relative path, if 'mongodb'
    //    is in the modules arg and `{internals: true}` option is given;
    // 3. `require('/var/task/index.js')` if the exact resolved absolute path
    //    is in the modules arg; and
    // 4. `require('react-dom/server')`, a "sub-module", if 'react-dom/server'
    //    is in the modules arg.
    //
    // The wrinkle is that the modPath "mongodb/lib/foo.js" need not be in the
    // `modules` argument to RITM, but the similar-looking "react-dom/server"
    // must be.
    const modules = new Set();
    const hasModExt = /\.(js|cjs|mjs|json)$/;
    Object.keys(this._infoFromModPath).forEach((modPath) => {
      const modName = modNameFromModPath(modPath);
      if (modPath === modName) {
        modules.add(modPath);
      } else {
        if (hasModExt.test(modPath)) {
          modules.add(modName); // case 2
        } else {
          // Beware the RITM bug: passing both 'foo' and 'foo/subpath' results
          // in 'foo/subpath' not being hooked.
          // TODO: link to issue for this
          modules.add(modPath); // case 4
        }
      }
    });

    return Array.from(modules);
  }

  /**
   * Get the string on the `disableInstrumentations` config var that indicates
   * if this module path should be disabled.
   *
   * Typically this is the module name -- e.g. "@redis/client" -- but might be
   * a custom value -- e.g. "lambda" for a Lambda handler path.
   *
   * @returns {string | undefined}
   */
  diKey(modPath) {
    return this._infoFromModPath[modPath]?.diKey;
  }
}

function Instrumentation(agent) {
  this._agent = agent;
  this._disableInstrumentationsSet = null;
  this._ritmHook = null;
  this._iitmHook = null;
  this._started = false;
  this._runCtxMgr = null;
  this._log = agent.logger;
  this._patcherReg = new PatcherRegistry();
  this._cachedVerFromModBaseDir = new Map();
}

Instrumentation.prototype.currTransaction = function () {
  if (!this._started) {
    return null;
  }
  return this._runCtxMgr.active().currTransaction();
};

Instrumentation.prototype.currSpan = function () {
  if (!this._started) {
    return null;
  }
  return this._runCtxMgr.active().currSpan();
};

Instrumentation.prototype.ids = function () {
  if (!this._started) {
    return new Ids();
  }
  const runContext = this._runCtxMgr.active();
  const currSpanOrTrans = runContext.currSpan() || runContext.currTransaction();
  if (currSpanOrTrans) {
    return currSpanOrTrans.ids;
  }
  return new Ids();
};

Instrumentation.prototype.addPatch = function (modules, handler) {
  if (!Array.isArray(modules)) {
    modules = [modules];
  }
  for (const modPath of modules) {
    const type = typeof handler;
    if (type !== 'function' && type !== 'string') {
      this._agent.logger.error('Invalid patch handler type: %s', type);
      return;
    }
    this._patcherReg.add(modPath, handler);
  }
  this._restartHooks();
};

Instrumentation.prototype.removePatch = function (modules, handler) {
  if (!Array.isArray(modules)) modules = [modules];

  for (const modPath of modules) {
    this._patcherReg.remove(modPath, handler);
  }

  this._restartHooks();
};

Instrumentation.prototype.clearPatches = function (modules) {
  if (!Array.isArray(modules)) modules = [modules];

  for (const modPath of modules) {
    this._patcherReg.clear(modPath);
  }

  this._restartHooks();
};

// If in a Lambda environment, find its handler and add a patcher for it.
Instrumentation.prototype._maybeLoadLambdaPatcher = function () {
  let lambdaHandlerInfo = getLambdaHandlerInfo(process.env);

  if (lambdaHandlerInfo && this._patcherReg.has(lambdaHandlerInfo.modName)) {
    this._log.warn(
      'Unable to instrument Lambda handler "%s" due to name conflict with "%s", please choose a different Lambda handler name',
      process.env._HANDLER,
      lambdaHandlerInfo.modName,
    );
    lambdaHandlerInfo = null;
  }

  if (lambdaHandlerInfo) {
    const { createLambdaPatcher } = require('./modules/_lambda-handler');
    this._lambdaHandlerInfo = lambdaHandlerInfo;
    this._patcherReg.add(
      this._lambdaHandlerInfo.filePath,
      createLambdaPatcher(lambdaHandlerInfo.propPath),
      'lambda', // diKey
    );
  }
};

// Start the instrumentation system.
//
// @param {RunContext} [runContextClass] - A class to use for the core object
//    that is used to track run context. It defaults to `RunContext`. If given,
//    it must be `RunContext` (the typical case) or a subclass of it. The OTel
//    Bridge uses this to provide a subclass that bridges to OpenTelemetry
//    `Context` usage.
Instrumentation.prototype.start = function (runContextClass) {
  if (this._started) return;
  this._started = true;

  // Could have changed in Agent.start().
  this._log = this._agent.logger;

  // Select the appropriate run-context manager.
  const confContextManager = this._agent._conf.contextManager;
  if (confContextManager === CONTEXT_MANAGER_ASYNCHOOKS) {
    this._runCtxMgr = new AsyncHooksRunContextManager(
      this._log,
      runContextClass,
    );
  } else if (nodeSupportsAsyncLocalStorage) {
    this._runCtxMgr = new AsyncLocalStorageRunContextManager(
      this._log,
      runContextClass,
    );
  } else {
    if (confContextManager === CONTEXT_MANAGER_ASYNCLOCALSTORAGE) {
      this._log.warn(
        `config includes 'contextManager="${confContextManager}"', but node ${process.version} does not support AsyncLocalStorage for run-context management: falling back to using async_hooks`,
      );
    }
    this._runCtxMgr = new AsyncHooksRunContextManager(
      this._log,
      runContextClass,
    );
  }

  // Load module patchers: from MODULE_PATCHERS, for Lambda, and from
  // config.addPatch.
  for (let info of MODULE_PATCHERS) {
    let patcher;
    if (info.patcher) {
      patcher = path.resolve(__dirname, info.patcher);
    } else {
      // Typically the patcher module for the APM agent's included
      // instrumentations is "./modules/${modPath}[.js]".
      patcher = path.resolve(
        __dirname,
        'modules',
        info.modPath + (info.modPath.endsWith('.js') ? '' : '.js'),
      );
    }

    this._patcherReg.add(info.modPath, patcher, info.diKey);
  }

  this._maybeLoadLambdaPatcher();

  const patches = this._agent._conf.addPatch;
  if (Array.isArray(patches)) {
    for (const [modPath, patcher] of patches) {
      this._patcherReg.add(modPath, patcher);
    }
  }

  this._runCtxMgr.enable();
  this._restartHooks();

  if (nodeHasInstrumentableFetch && this._isModuleEnabled('undici')) {
    this._log.debug('instrumenting fetch');
    undiciInstr.instrumentUndici(this._agent);
  }

  if (azureFunctionsInstr.isAzureFunctionsEnvironment) {
    this._log.debug('instrumenting azure-functions');
    azureFunctionsInstr.instrument(this._agent);
  }
};

// Stop active instrumentation and reset global state *as much as possible*.
//
// Limitations: Removing and re-applying 'require-in-the-middle'-based patches
// has no way to update existing references to patched or unpatched exports from
// those modules.
Instrumentation.prototype.stop = function () {
  this._started = false;

  // Reset run context tracking.
  if (this._runCtxMgr) {
    this._runCtxMgr.disable();
    this._runCtxMgr = null;
  }

  // Reset patching.
  if (this._ritmHook) {
    this._ritmHook.unhook();
    this._ritmHook = null;
  }
  if (this._iitmHook) {
    this._iitmHook.unhook();
    this._iitmHook = null;
  }
  this._patcherReg.reset();
  this._lambdaHandlerInfo = null;
  if (nodeHasInstrumentableFetch) {
    undiciInstr.uninstrumentUndici();
  }
  if (azureFunctionsInstr.isAzureFunctionsEnvironment) {
    azureFunctionsInstr.uninstrument();
  }
};

// Reset internal state for (relatively) clean re-use of this Instrumentation.
// Used for testing, while `resetAgent()` + "test/_agent.js" usage still exists.
//
// This does *not* include redoing monkey patching. It resets context tracking,
// so a subsequent test case can re-use the Instrumentation in the same process.
Instrumentation.prototype.testReset = function () {
  if (this._runCtxMgr) {
    this._runCtxMgr.testReset();
  }
};

Instrumentation.prototype._isModuleEnabled = function (modName) {
  if (!this._disableInstrumentationsSet) {
    this._disableInstrumentationsSet = new Set(
      this._agent._conf.disableInstrumentations,
    );
  }
  return (
    this._agent._conf.instrument &&
    !this._disableInstrumentationsSet.has(modName)
  );
};

Instrumentation.prototype._restartHooks = function () {
  if (!this._started) {
    return;
  }
  if (this._ritmHook || this._iitmHook) {
    this._agent.logger.debug('removing hooks to Node.js module loader');
    if (this._ritmHook) {
      this._ritmHook.unhook();
    }
    if (this._iitmHook) {
      this._iitmHook.unhook();
    }
  }

  var self = this;

  this._log.debug('adding Node.js module loader hooks');

  this._ritmHook = new RitmHook(
    this._patcherReg.ritmModulesArg(),
    { internals: true },
    function (exports, modPath, basedir) {
      let version = undefined;

      // An *absolute path* given to RITM results in the file *basename* being
      // used as `modPath` in this callback. We need the absolute path back to
      // look up the patcher in our registry. We know the only absolute path
      // we use is for our Lambda handler.
      if (self._lambdaHandlerInfo?.modName === modPath) {
        modPath = self._lambdaHandlerInfo.filePath;
        version = process.env.AWS_LAMBDA_FUNCTION_VERSION || '';
      }

      if (!self._patcherReg.has(modPath)) {
        // Skip out if there are no patchers for this hooked module name.
        return exports;
      }

      // Find an appropriate version for this modPath.
      if (version !== undefined) {
        // Lambda version already handled above.
      } else if (!basedir) {
        // This is a core module.
        version = process.versions.node;
      } else {
        // This is a module (e.g. 'mongodb') or a module internal path
        // ('mongodb/lib/cmap/connection_pool.js').
        version = self._getPackageVersion(modPath, basedir);
        if (version === undefined) {
          self._log.debug('could not patch %s module', modPath);
          return exports;
        }
      }

      const diKey = self._patcherReg.diKey(modPath);
      const enabled = self._isModuleEnabled(diKey);
      return self._patchModule(exports, modPath, version, enabled, false);
    },
  );

  this._iitmHook = IitmHook(
    // TODO: Eventually derive this from `_patcherRegistry`.
    Object.keys(IITM_MODULES),
    function (modExports, modName, modBaseDir) {
      const enabled = self._isModuleEnabled(modName);
      const version = modBaseDir
        ? self._getPackageVersion(modName, modBaseDir)
        : process.versions.node;
      if (IITM_MODULES[modName].instrumentImportMod) {
        return self._patchModule(modExports, modName, version, enabled, true);
      } else {
        modExports.default = self._patchModule(
          modExports.default,
          modName,
          version,
          enabled,
          false,
        );
        return modExports;
      }
    },
  );
};

Instrumentation.prototype._getPackageVersion = function (modName, modBaseDir) {
  if (this._cachedVerFromModBaseDir.has(modBaseDir)) {
    return this._cachedVerFromModBaseDir.get(modBaseDir);
  }

  let ver = undefined;
  try {
    const version = JSON.parse(
      fs.readFileSync(path.join(modBaseDir, 'package.json')),
    ).version;
    if (typeof version === 'string') {
      ver = version;
    }
  } catch (err) {
    this._agent.logger.debug(
      { modName, modBaseDir, err },
      'could not load package version',
    );
  }

  this._cachedVerFromModBaseDir.set(modBaseDir, ver);
  return ver;
};

/**
 * Patch/instrument the given module.
 *
 * @param {Module | any} modExports The object made available by the RITM or
 *    IITM hook. For a `require` this is the `module.exports` value, which can
 *    by any type. For an `import` this is a `Module` object if
 *    `isImportMod=true`, or the default export (the equivalent of
 *    `module.exports`) if `isImportMod=false`.
 * @param {string} modPath
 * @param {string} version
 * @param {boolean} enabled Whether instrumentation is enabled for this module
 *    depending on the `disableInstrumentations` config value. (Currently the
 *    http, https, and http2 instrumentations, at least, do *some* work even if
 *    enabled=false.)
 * @param {boolean} isImportMod When false, the `modExports` param is the
 *    `module.exports` object (typically from a `require`). When true,
 *    `modExports` is the `Module` instance from an `import`. This depends on
 *    the `instrumentImportMod` flag that is set per module.
 */
Instrumentation.prototype._patchModule = function (
  modExports,
  modPath,
  version,
  enabled,
  isImportMod,
) {
  this._log.debug(
    'instrumenting %s@%s module (enabled=%s, isImportMod=%s)',
    modPath,
    version,
    enabled,
    isImportMod,
  );
  const patchers = this._patcherReg.getPatchers(modPath);
  if (patchers) {
    for (let patcher of patchers) {
      if (typeof patcher === 'string') {
        if (patcher[0] === '.') {
          patcher = path.resolve(process.cwd(), patcher);
        }
        patcher = require(patcher);
      }

      const type = typeof patcher;
      if (type !== 'function') {
        this._agent.logger.error(
          'Invalid patch handler type "%s" for module "%s"',
          type,
          modPath,
        );
        continue;
      }

      modExports = patcher(modExports, this._agent, {
        name: modPath,
        version,
        enabled,
        isImportMod,
      });
    }
  }
  return modExports;
};

Instrumentation.prototype.addEndedTransaction = function (transaction) {
  var agent = this._agent;

  if (!this._started) {
    agent.logger.debug('ignoring transaction %o', {
      trans: transaction.id,
      trace: transaction.traceId,
    });
    return;
  }

  const rc = this._runCtxMgr.active();
  if (rc.currTransaction() === transaction) {
    // Replace the active run context with an empty one. I.e. there is now
    // no active transaction or span (at least in this async task).
    this._runCtxMgr.supersedeRunContext(this._runCtxMgr.root());
    this._log.debug(
      { ctxmgr: this._runCtxMgr.toString() },
      'addEndedTransaction(%s)',
      transaction.name,
    );
  }

  // Avoid transaction filtering time if only propagating trace-context.
  if (agent._conf.contextPropagationOnly) {
    // This one log.trace related to contextPropagationOnly is included as a
    // possible log hint to future debugging for why events are not being sent
    // to APM server.
    agent.logger.trace('contextPropagationOnly: skip sendTransaction');
    return;
  }

  // https://github.com/elastic/apm/blob/main/specs/agents/tracing-sampling.md#non-sampled-transactions
  if (
    !transaction.sampled &&
    !agent._apmClient.supportsKeepingUnsampledTransaction()
  ) {
    return;
  }

  // if I have ended and I have something buffered, send that buffered thing
  if (transaction.getBufferedSpan()) {
    this._encodeAndSendSpan(transaction.getBufferedSpan());
  }

  var payload = agent._transactionFilters.process(transaction._encode());
  if (!payload) {
    agent.logger.debug('transaction ignored by filter %o', {
      trans: transaction.id,
      trace: transaction.traceId,
    });
    return;
  }

  agent.logger.debug('sending transaction %o', {
    trans: transaction.id,
    trace: transaction.traceId,
  });
  agent._apmClient.sendTransaction(payload);
};

Instrumentation.prototype.addEndedSpan = function (span) {
  var agent = this._agent;

  if (!this._started) {
    agent.logger.debug('ignoring span %o', {
      span: span.id,
      parent: span.parentId,
      trace: span.traceId,
      name: span.name,
      type: span.type,
    });
    return;
  }

  // Replace the active run context with this span removed. Typically this
  // span is the top of stack (i.e. is the current span). However, it is
  // possible to have out-of-order span.end(), in which case the ended span
  // might not.
  const newRc = this._runCtxMgr.active().leaveSpan(span);
  if (newRc) {
    this._runCtxMgr.supersedeRunContext(newRc);
  }
  this._log.debug(
    { ctxmgr: this._runCtxMgr.toString() },
    'addEndedSpan(%s)',
    span.name,
  );

  // Avoid span encoding time if only propagating trace-context.
  if (agent._conf.contextPropagationOnly) {
    return;
  }

  if (!span.isRecorded()) {
    span.transaction.captureDroppedSpan(span);
    return;
  }

  if (!this._agent._conf.spanCompressionEnabled) {
    this._encodeAndSendSpan(span);
  } else {
    // if I have ended and I have something buffered, send that buffered thing
    if (span.getBufferedSpan()) {
      this._encodeAndSendSpan(span.getBufferedSpan());
      span.setBufferedSpan(null);
    }

    const parentSpan = span.getParentSpan();
    if ((parentSpan && parentSpan.ended) || !span.isCompressionEligible()) {
      const buffered = parentSpan && parentSpan.getBufferedSpan();
      if (buffered) {
        this._encodeAndSendSpan(buffered);
        parentSpan.setBufferedSpan(null);
      }
      this._encodeAndSendSpan(span);
    } else if (!parentSpan.getBufferedSpan()) {
      // span is compressible and there's nothing buffered
      // add to buffer, move on
      parentSpan.setBufferedSpan(span);
    } else if (!parentSpan.getBufferedSpan().tryToCompress(span)) {
      // we could not compress span so SEND bufferend span
      // and buffer the span we could not compress
      this._encodeAndSendSpan(parentSpan.getBufferedSpan());
      parentSpan.setBufferedSpan(span);
    }
  }
};

Instrumentation.prototype._encodeAndSendSpan = function (span) {
  const duration = span.isComposite()
    ? span.getCompositeSum()
    : span.duration();
  if (
    span.discardable &&
    duration / 1000 < this._agent._conf.exitSpanMinDuration
  ) {
    span.transaction.captureDroppedSpan(span);
    return;
  }

  const agent = this._agent;
  // Note this error as an "inflight" event. See Agent#flush().
  const inflightEvents = agent._inflightEvents;
  inflightEvents.add(span.id);

  agent.logger.debug('encoding span %o', {
    span: span.id,
    parent: span.parentId,
    trace: span.traceId,
    name: span.name,
    type: span.type,
  });
  span._encode(function (err, payload) {
    if (err) {
      agent.logger.error('error encoding span %o', {
        span: span.id,
        parent: span.parentId,
        trace: span.traceId,
        name: span.name,
        type: span.type,
        error: err.message,
      });
    } else {
      payload = agent._spanFilters.process(payload);
      if (!payload) {
        agent.logger.debug('span ignored by filter %o', {
          span: span.id,
          parent: span.parentId,
          trace: span.traceId,
          name: span.name,
          type: span.type,
        });
      } else {
        agent.logger.debug('sending span %o', {
          span: span.id,
          parent: span.parentId,
          trace: span.traceId,
          name: span.name,
          type: span.type,
        });
        if (agent._apmClient) {
          agent._apmClient.sendSpan(payload);
        }
      }
    }
    inflightEvents.delete(span.id);
  });
};

// Replace the current run context with one where the given transaction is
// current.
Instrumentation.prototype.supersedeWithTransRunContext = function (trans) {
  if (this._started) {
    const rc = this._runCtxMgr.root().enterTrans(trans);
    this._runCtxMgr.supersedeRunContext(rc);
    this._log.debug(
      { ctxmgr: this._runCtxMgr.toString() },
      'supersedeWithTransRunContext(<Trans %s>)',
      trans.id,
    );
  }
};

// Replace the current run context with one where the given span is current.
Instrumentation.prototype.supersedeWithSpanRunContext = function (span) {
  if (this._started) {
    const rc = this._runCtxMgr.active().enterSpan(span);
    this._runCtxMgr.supersedeRunContext(rc);
    this._log.debug(
      { ctxmgr: this._runCtxMgr.toString() },
      'supersedeWithSpanRunContext(<Span %s>)',
      span.id,
    );
  }
};

// Set the current run context to have *no* transaction. No spans will be
// created in this run context until a subsequent `startTransaction()`.
Instrumentation.prototype.supersedeWithEmptyRunContext = function () {
  if (this._started) {
    this._runCtxMgr.supersedeRunContext(this._runCtxMgr.root());
    this._log.debug(
      { ctxmgr: this._runCtxMgr.toString() },
      'supersedeWithEmptyRunContext()',
    );
  }
};

// Create a new transaction, but do *not* replace the current run context to
// make this the "current" transaction. Compare to `startTransaction`.
Instrumentation.prototype.createTransaction = function (name, ...args) {
  return new Transaction(this._agent, name, ...args);
};

Instrumentation.prototype.startTransaction = function (name, ...args) {
  if (!this._agent.isStarted()) {
    return new NoopTransaction();
  }
  const trans = new Transaction(this._agent, name, ...args);
  this.supersedeWithTransRunContext(trans);
  return trans;
};

Instrumentation.prototype.endTransaction = function (result, endTime) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'cannot end transaction - no active transaction found',
    );
    return;
  }
  trans.end(result, endTime);
};

Instrumentation.prototype.setDefaultTransactionName = function (name) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'no active transaction found - cannot set default transaction name',
    );
    return;
  }
  trans.setDefaultName(name);
};

Instrumentation.prototype.setTransactionName = function (name) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'no active transaction found - cannot set transaction name',
    );
    return;
  }
  trans.name = name;
};

Instrumentation.prototype.setTransactionOutcome = function (outcome) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'no active transaction found - cannot set transaction outcome',
    );
    return;
  }
  trans.setOutcome(outcome);
};

// Create a new span in the current transaction, if any, and make it the
// current span. The started span is returned. This will return null if a span
// could not be created -- which could happen for a number of reasons.
Instrumentation.prototype.startSpan = function (
  name,
  type,
  subtype,
  action,
  opts,
) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'no active transaction found - cannot build new span',
    );
    return null;
  }
  return trans.startSpan.apply(trans, arguments);
};

// Create a new span in the current transaction, if any. The created span is
// returned, or null if the span could not be created.
//
// This does *not* replace the current run context to make this span the
// "current" one. This allows instrumentations to avoid impacting the run
// context of the calling code. Compare to `startSpan`.
Instrumentation.prototype.createSpan = function (
  name,
  type,
  subtype,
  action,
  opts,
) {
  const trans = this.currTransaction();
  if (!trans) {
    this._agent.logger.debug(
      'no active transaction found - cannot build new span',
    );
    return null;
  }
  return trans.createSpan.apply(trans, arguments);
};

Instrumentation.prototype.setSpanOutcome = function (outcome) {
  const span = this.currSpan();
  if (!span) {
    this._agent.logger.debug('no active span found - cannot set span outcome');
    return null;
  }
  span.setOutcome(outcome);
};

Instrumentation.prototype.currRunContext = function () {
  if (!this._started) {
    return null;
  }
  return this._runCtxMgr.active();
};

// Bind the given function to the current run context.
Instrumentation.prototype.bindFunction = function (fn) {
  if (!this._started) {
    return fn;
  }
  return this._runCtxMgr.bindFn(this._runCtxMgr.active(), fn);
};

// Bind the given function to a given run context.
Instrumentation.prototype.bindFunctionToRunContext = function (runContext, fn) {
  if (!this._started) {
    return fn;
  }
  return this._runCtxMgr.bindFn(runContext, fn);
};

// Bind the given function to an *empty* run context.
// This can be used to ensure `fn` does *not* run in the context of the current
// transaction or span.
Instrumentation.prototype.bindFunctionToEmptyRunContext = function (fn) {
  if (!this._started) {
    return fn;
  }
  return this._runCtxMgr.bindFn(this._runCtxMgr.root(), fn);
};

// Bind the given EventEmitter to the current run context.
//
// This wraps the emitter so that any added event handler function is bound
// as if `bindFunction` had been called on it. Note that `ee` need not
// inherit from EventEmitter -- it uses duck typing.
Instrumentation.prototype.bindEmitter = function (ee) {
  if (!this._started) {
    return ee;
  }
  return this._runCtxMgr.bindEE(this._runCtxMgr.active(), ee);
};

// Bind the given EventEmitter to a given run context.
Instrumentation.prototype.bindEmitterToRunContext = function (runContext, ee) {
  if (!this._started) {
    return ee;
  }
  return this._runCtxMgr.bindEE(runContext, ee);
};

// Return true iff the given EventEmitter is bound to a run context.
Instrumentation.prototype.isEventEmitterBound = function (ee) {
  if (!this._started) {
    return false;
  }
  return this._runCtxMgr.isEEBound(ee);
};

// Invoke the given function in the context of `runContext`.
Instrumentation.prototype.withRunContext = function (
  runContext,
  fn,
  thisArg,
  ...args
) {
  if (!this._started) {
    return fn.call(thisArg, ...args);
  }
  return this._runCtxMgr.with(runContext, fn, thisArg, ...args);
};

module.exports = {
  Instrumentation,
};
