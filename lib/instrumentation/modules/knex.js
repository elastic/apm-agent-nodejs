/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Knex instrumentation exists to capture a more useful span stacktrace at
// the start of a Knex query, and use that stacktrace on the 'pg' or 'mysql'
// span.

'use strict';

var semver = require('semver');

var shimmer = require('../shimmer');
var symbols = require('../../symbols');

module.exports = function (Knex, agent, { version, enabled }) {
  if (!enabled) {
    return Knex;
  }
  if (agent._conf.spanStackTraceMinDuration < 0) {
    agent.logger.trace(
      'not instrumenting knex because not capturing span stack traces (spanStackTraceMinDuration=%s)',
      agent._conf.spanStackTraceMinDuration,
    );
    return Knex;
  }

  if (semver.gte(version, '3.0.0')) {
    agent.logger.debug('knex version %s not supported - aborting...', version);
    return Knex;
  }
  if (
    semver.satisfies(version, '>=1 <3') &&
    semver.lt(process.version, '12.0.0')
  ) {
    agent.logger.debug(
      'knex version %s does not support node %s, skipping knex instrumentation',
      version,
      process.version,
    );
    return Knex;
  }

  function wrapQueryStartPoint(original) {
    return function wrappedQueryStartPoint() {
      var builder = original.apply(this, arguments);

      agent.logger.debug('capturing custom stack trace for knex');
      var obj = {};
      Error.captureStackTrace(obj);
      builder[symbols.knexStackObj] = obj;

      return builder;
    };
  }

  function wrapRunner(original) {
    return function wrappedRunner() {
      var runner = original.apply(this, arguments);

      agent.logger.debug('shimming knex runner.query');
      shimmer.wrap(runner, 'query', wrapQuery);

      return runner;
    };
  }

  function wrapQuery(original) {
    return function wrappedQuery() {
      agent.logger.debug('intercepted call to knex runner.query');
      if (this.connection) {
        this.connection[symbols.knexStackObj] = this.builder
          ? this.builder[symbols.knexStackObj]
          : null;
      }
      return original.apply(this, arguments);
    };
  }

  return function wrappedKnex() {
    const knexInstance = Knex.apply(null, arguments);

    if (knexInstance && knexInstance.client) {
      const QUERY_FNS = ['queryBuilder', 'raw'];
      agent.logger.debug('shimming knexInstance.client.runner');
      shimmer.wrap(knexInstance.client, 'runner', wrapRunner);
      agent.logger.debug(
        'shimming Knex.Client.prototype functions: %j',
        QUERY_FNS,
      );
      shimmer.massWrap(knexInstance.client, QUERY_FNS, wrapQueryStartPoint);
    } else {
      agent.logger.debug('could not shim Knex');
    }

    return knexInstance;
  };
};
