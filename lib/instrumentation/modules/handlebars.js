/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');

var shimmer = require('../shimmer');
var templateShared = require('../template-shared');

module.exports = function (handlebars, agent, { version, enabled }) {
  if (!enabled) return handlebars;

  if (!semver.satisfies(version, '>=1 <5')) {
    agent.logger.debug(
      'cannot instrument handlebars version %s, skipping handlebars instrumentation',
      version,
    );
    return handlebars;
  }

  agent.logger.debug('shimming handlebars.compile');
  shimmer.wrap(
    handlebars,
    'compile',
    templateShared.wrapCompile(agent, 'handlebars'),
  );

  return handlebars;
};
