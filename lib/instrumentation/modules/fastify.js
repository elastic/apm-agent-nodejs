/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Instrumentation of fastify.
// https://www.fastify.io/docs/latest/LTS/

const semver = require('semver');

module.exports = function (
  modExports,
  agent,
  { version, enabled, isImportMod },
) {
  if (!enabled) {
    return modExports;
  }
  if (isImportMod && !semver.satisfies(version, '>=3.5.0')) {
    // https://github.com/fastify/fastify/pull/2590
    agent.logger.debug(
      'ESM instrumentation of fastify requires fastify >=3.5.0, skipping instrumentation',
    );
    return modExports;
  }

  agent.setFramework({ name: 'fastify', version, overwrite: false });

  agent.logger.debug('wrapping fastify build function');
  const origFastify = isImportMod ? modExports.default : modExports;

  var wrapper;
  if (semver.gte(version, '3.0.0')) {
    wrapper = wrappedFastify;
  } else if (semver.gte(version, '2.0.0-rc')) {
    wrapper = wrappedFastify2;
  } else {
    wrapper = wrappedFastify1;
  }

  // Assign all enumerable properties to the wrapper.
  // - 'fastify' and 'default' are intentionally circular references to
  //   support various import/require styles. See:
  //   https://github.com/fastify/fastify/blob/v4.17.0/fastify.js#L814-L827
  for (var prop in origFastify) {
    switch (prop) {
      case 'fastify':
      case 'default':
        wrapper[prop] = wrapper;
        break;
      default:
        wrapper[prop] = origFastify[prop];
        break;
    }
  }

  if (isImportMod) {
    modExports.fastify = wrapper;
    modExports.default = wrapper;
    return modExports;
  } else {
    return wrapper;
  }

  function wrappedFastify() {
    const _fastify = origFastify.apply(null, arguments);

    agent.logger.debug('adding onRequest hook to fastify');
    _fastify.addHook('onRequest', (req, reply, next) => {
      const method = req.routerMethod || req.raw.method; // Fallback for fastify >3 <3.3.0
      const url = req.routerPath || reply.context.config.url; // Fallback for fastify >3 <3.3.0
      const name = method + ' ' + url;
      agent._instrumentation.setDefaultTransactionName(name);
      next();
    });

    agent.logger.debug('adding preHandler hook to fastify');
    _fastify.addHook('preHandler', (req, reply, next) => {
      // Save the parsed req body to be picked up by getContextFromRequest().
      req.raw.body = req.body;
      next();
    });

    agent.logger.debug('adding onError hook to fastify');
    _fastify.addHook('onError', (req, reply, err, next) => {
      agent.captureError(err, { request: req.raw });
      next();
    });

    return _fastify;
  }

  function wrappedFastify2() {
    const _fastify = origFastify.apply(null, arguments);

    agent.logger.debug('adding onRequest hook to fastify');
    _fastify.addHook('onRequest', (req, reply, next) => {
      const context = reply.context;
      const name = req.raw.method + ' ' + context.config.url;
      agent._instrumentation.setDefaultTransactionName(name);
      next();
    });

    agent.logger.debug('adding preHandler hook to fastify');
    _fastify.addHook('preHandler', (req, reply, next) => {
      // Save the parsed req body to be picked up by getContextFromRequest().
      req.raw.body = req.body;
      next();
    });

    agent.logger.debug('adding onError hook to fastify');
    _fastify.addHook('onError', (req, reply, err, next) => {
      agent.captureError(err, { request: req.raw });
      next();
    });

    return _fastify;
  }

  function wrappedFastify1() {
    const _fastify = origFastify.apply(null, arguments);

    agent.logger.debug('adding onRequest hook to fastify');
    _fastify.addHook('onRequest', (req, reply, next) => {
      const context = reply._context;
      const name = req.method + ' ' + context.config.url;
      agent._instrumentation.setDefaultTransactionName(name);
      next();
    });

    agent.logger.debug('adding preHandler hook to fastify');
    _fastify.addHook('preHandler', (req, reply, next) => {
      // Save the parsed req body to be picked up by getContextFromRequest().
      req.raw.body = req.body;
      next();
    });

    agent.logger.warn(
      'Elastic APM cannot automaticaly capture errors on this verison of Fastify. Upgrade to version 2.0.0 or later.',
    );

    return _fastify;
  }
};
