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
  console.log('XXX createLambdaPatcher: propPath=%s', propPath);
  return function lambdaHandlerPatcher(module, agent, { enabled, isImportMod }) {
    console.log('XXX lambdaHandlerPatcher:', {enabled, isImportMod});
    if (!enabled) {
      return module;
    }

    if (isImportMod) {
      // XXX hack assume propPath === 'handler'
      console.log('XXX lambdaHandlerPatcher: isImportMod path', propPath);
      // module.handler = wrapLambdaHandler(module.handler)
      console.log('XXX module before: ', module);
      module.handler = agent.lambda(module.handler);
      console.log('XXX module after: ', module);
      return;
    }

    try {
      // console.log('XXX propwrap: propPath=%s', propPath);
      const newMod = propwrap.wrap(module, propPath, (orig) => {
        return agent.lambda(orig);
      });
      // console.log('XXX newMod: ', newMod);
      // console.log('XXX (old) module: ', module);
      // console.log('XXX newMod.default: ', newMod.default);
      return newMod;
    } catch (wrapErr) {
      // console.log('XXX wrapErr: ', wrapErr);
      agent.logger.warn('could not wrap lambda handler: %s', wrapErr);
      return module;
    }
  };
}

module.exports = {
  createLambdaPatcher,
};
