/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const propwrap = require('../../propwrap');

/**
 * Return a patch handler, `function (module, agent, options)`, that will patch
 * the Lambda handler function at the given property path.
 *
 * For example, a Lambda _HANDLER=index.handler indicates that a file "index.js"
 * has a `handler` export that is the Lambda handler function. In this case
 * `module` will be the imported "index.js" module and `propPath` will be
 * "handler".
 */
function createLambdaPatcher(propPath) {
  return function lambdaHandlerPatcher(module, agent, { enabled }) {
    if (!enabled) {
      return module;
    }

    try {
      const newMod = propwrap.wrap(module, propPath, (orig) => {
        return agent.lambda(orig);
      });
      return newMod;
    } catch (wrapErr) {
      agent.logger.warn('could not wrap lambda handler: %s', wrapErr);
      return module;
    }
  };
}

module.exports = {
  createLambdaPatcher,
};
