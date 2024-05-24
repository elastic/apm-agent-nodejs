/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var semver = require('semver');
var sqlSummary = require('sql-summary');

var shimmer = require('../shimmer');
var symbols = require('../../symbols');
var { getDBDestination } = require('../context');
const { config } = require('bluebird');

module.exports = function (mariadb, agent, { version, enabled, name }) {
  console.log('Starting mariadb instrumentation');
  if (!enabled) {
    return mariadb;
  }

  if (!semver.satisfies(version, '>=3.3.0')) {
    agent.logger.debug(
      'mariab version %s not supported - aborting...',
      version,
    );
    return mariadb;
  }

  var ins = agent._instrumentation;
  let defaultConfig = mariadb.defaultOptions();
  let config = {};

  shimmer.wrap(mariadb, 'createConnection', wrapConnection);
  shimmer.wrap(mariadb, 'createPool', wrapPool);
  shimmer.wrap(mariadb, 'createPoolCluster', wrapPool);

  return mariadb;

  function wrapPool(original) {
    return function wrappedPool() {
      console.log('Inserting wrapPool');
      let result = original.apply(this, arguments);
      console.log('Result', result);
      shimmer.wrap(
        result,
        'getConnection',
        function wrapGetConnection(...args) {
          console.log('Test');
          if (typeof arguments[0] === 'object') {
            console.log('Cambiadno');
            config = {
              ...defaultConfig,
              ...arguments[0],
            };
          }

          return wrapConnection.apply(result, args);
        },
      );
      console.log('Result2', result);

      if (typeof result.add === 'function') {
        shimmer.wrap(result, 'add', wrapAdd);
      }
      if (typeof result.of === 'function') {
        shimmer.wrap(result, 'of', wrapPool);
      }

      if (typeof result.query === 'function') {
        shimmer.wrap(result, 'query', wrapQuery);
      }
      if (typeof result.execute === 'function') {
        shimmer.wrap(result, 'execute', wrapQuery);
      }

      if (typeof result.queryStream === 'function') {
        shimmer.wrap(result, 'queryStream', wrapQuery);
      }
      return result;
    };
  }

  function wrapAdd(original) {
    return function wrappedAdd() {
      console.log('Executing wrapAdd', original, arguments);
      config = {
        ...defaultConfig,
        ...arguments[1],
      };
      return original.apply(this, arguments);
    };
  }

  function wrapConnection(original) {
    return function wrappedConnection() {
      console.log('Executing wrapConnection', name, arguments);

      if (typeof arguments[0] === 'object') {
        config = {
          ...defaultConfig,
          ...arguments[0],
        };
      }
      console.log(arguments);

      if (!name.includes('callback')) {
        console.log('Shimming promise');
        return original.apply(this, arguments).then((res) => {
          if (typeof res.query === 'function') {
            shimmer.wrap(res, 'query', wrapQuery);
          }
          if (typeof res.execute === 'function') {
            shimmer.wrap(res, 'execute', wrapQuery);
          }

          if (typeof res.queryStream === 'function') {
            shimmer.wrap(res, 'queryStream', wrapQuery);
          }

          return Promise.resolve(res);
        });
      }
      console.log('test');

      if (typeof arguments[arguments.length - 1] === 'function') {
        console.log('Shimming callback', original);

        return original.apply(this, [
          ...[...arguments].slice(0, arguments.length - 1),
          (err, conn) => {
            console.log('MI CALLBACK');
            console.log(err);
            if (err) return arguments[0](err);
            console.log('test345');

            if (typeof conn.query === 'function') {
              shimmer.wrap(conn, 'query', wrapQuery);
            }
            if (typeof conn.execute === 'function') {
              shimmer.wrap(conn, 'execute', wrapQuery);
            }

            if (typeof conn.queryStream === 'function') {
              shimmer.wrap(conn, 'queryStream', wrapQuery);
            }

            return arguments[0](err, conn);
          },
        ]);
      } else {
        console.log('Shimming WITHOUT callback');

        let result = original.apply(this, arguments);

        if (typeof result.query === 'function') {
          shimmer.wrap(result, 'query', wrapQuery);
        }
        if (typeof result.execute === 'function') {
          shimmer.wrap(result, 'execute', wrapQuery);
        }

        if (typeof result.queryStream === 'function') {
          shimmer.wrap(result, 'queryStream', wrapQuery);
        }

        return result;
      }
    };
  }
  function wrapQuery(original) {
    console.log('Inserting wrapQuery', original);
    return function wrappedQuery(sql, values, cb) {
      console.log('Executing wrapQuery', arguments, config);

      agent.logger.debug('intercepted call to mariadb.%s', original.name);
      var span = ins.createSpan(null, 'db', 'mariadb', 'query', {
        exitSpan: true,
      });
      if (!span) {
        return original.apply(this, arguments);
      }

      let hasCallback = false;
      const wrapCallback = function (origCallback) {
        hasCallback = true;
        return ins.bindFunction(function wrappedCallback(_err) {
          console.log('CAllbkac wrappeed', arguments);
          span.end();
          return origCallback.apply(this, arguments);
        });
      };
      let host, port, user, database;
      if (typeof config === 'object') {
        ({ host, port, user, database } = config);
      }

      span._setDestinationContext(getDBDestination(host, port));
      let sqlStr;
      switch (typeof sql) {
        case 'string':
          sqlStr = sql;
          break;
        case 'object':
          sqlStr = sql.sql;
          break;
        case 'function':
          arguments[0] = wrapCallback(sql);
          break;
      }

      if (sqlStr) {
        span.setDbContext({
          type: 'sql',
          instance: database,
          user,
          statement: sqlStr,
        });
        span.name = sqlSummary(sqlStr);
      } else {
        span.setDbContext({ type: 'sql', instance: database, user });
      }

      if (typeof values === 'function') {
        arguments[1] = wrapCallback(values);
      } else if (typeof cb === 'function') {
        arguments[2] = wrapCallback(cb);
      }

      const spanRunContext = ins.currRunContext().enterSpan(span);
      const result = ins.withRunContext(
        spanRunContext,
        original,
        this,
        ...arguments,
      );

      if (result && !hasCallback) {
        ins.bindEmitter(result);
        console.log('EMITER');
        shimmer.wrap(result, 'emit', function (origEmit) {
          return function (event) {
            console.log('Evento de callback', event);
            switch (event) {
              case 'error':
              case 'close':
              case 'send_end':
                span.end();
            }
            return origEmit.apply(this, arguments);
          };
        });
      }

      if (!hasCallback) {
        console.log('Ejecuting promise');
        return new Promise(async (resolve, reject) => {
          console.log('test1');
          let awaitedResult = await original.apply(this, arguments);
          console.log('test2');
          span.end();
          return resolve(awaitedResult);
        });
      }
      console.log('Devolviendo normal sin ');
      console.log(arguments);
      return original.apply(this, arguments);
    };
  }
};
