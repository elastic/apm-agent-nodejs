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

module.exports = function (
  mariadb,
  agent,
  { version, enabled, name: pkgName },
) {
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
      let result = original.apply(this, arguments);
      shimmer.wrap(
        result,
        'getConnection',
        function wrapGetConnection(...args) {
          if (typeof arguments[0] === 'object') {
            config = {
              ...defaultConfig,
              ...arguments[0],
            };
          }

          return wrapConnection.apply(result, args);
        },
      );

      if (typeof arguments[0] === 'object') {
        config = {
          ...defaultConfig,
          ...arguments[0],
        };
      }

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
      if (typeof result.batch === 'function') {
        shimmer.wrap(result, 'batch', wrapQuery);
      }
      return result;
    };
  }

  function wrapAdd(original) {
    return function wrappedAdd() {
      config = {
        ...defaultConfig,
        ...arguments[1],
      };
      return original.apply(this, arguments);
    };
  }

  function wrapConnection(original) {
    return function wrappedConnection() {
      if (typeof arguments[0] === 'object') {
        config = {
          ...defaultConfig,
          ...arguments[0],
        };
      }

      if (!pkgName.includes('callback')) {
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

          if (typeof res.batch === 'function') {
            shimmer.wrap(res, 'batch', wrapQuery);
          }

          if (typeof res.prepare === 'function') {
            shimmer.wrap(res, 'prepare', wrapPrepare);
          }

          return Promise.resolve(res);
        });
      }

      if (typeof arguments[arguments.length - 1] === 'function') {
        return original.apply(this, [
          ...[...arguments].slice(0, arguments.length - 1),
          (err, conn) => {
            if (err) return arguments[0](err);

            if (typeof conn.query === 'function') {
              shimmer.wrap(conn, 'query', wrapQuery);
            }
            if (typeof conn.execute === 'function') {
              shimmer.wrap(conn, 'execute', wrapQuery);
            }

            if (typeof conn.queryStream === 'function') {
              shimmer.wrap(conn, 'queryStream', wrapQuery);
            }
            if (typeof conn.batch === 'function') {
              shimmer.wrap(conn, 'batch', wrapQuery);
            }

            return arguments[0](err, conn);
          },
        ]);
      } else {
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
        if (typeof result.batch === 'function') {
          shimmer.wrap(result, 'batch', wrapQuery);
        }

        return result;
      }
    };
  }
  function wrapQuery(original, name) {
    return function wrappedQuery(sql, values, cb) {
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

      if (
        !hasCallback &&
        name !== 'queryStream' &&
        (name !== 'query' || !pkgName.includes('callback'))
      ) {
        return new Promise(async (resolve, reject) => {
          let awaitedResult = await original.apply(this, arguments);
          span.end();
          return resolve(awaitedResult);
        });
      }

      if (
        name === 'queryStream' ||
        (name === 'query' && pkgName.includes('callback') && !hasCallback)
      ) {
        let newResult = original.apply(this, arguments);

        ins.bindEmitter(newResult);
        shimmer.wrap(newResult, 'emit', function (origEmit) {
          return function (event) {
            switch (event) {
              case 'error':
              case 'end':
                span.end();
            }
            return origEmit.apply(this, arguments);
          };
        });
        return newResult;
      } else {
        return original.apply(this, arguments);
      }
    };
  }
  function wrapPrepare(original, name) {
    return function wrappedPrepare(sql) {
      return original.apply(this, arguments).then((newResult) => {
        function wrapPreparedExecute(original, name) {
          return function wrappedQuery(values) {
            agent.logger.debug('intercepted call to mariadb.%s', original.name);
            var span = ins.createSpan(null, 'db', 'mariadb', 'query', {
              exitSpan: true,
            });
            if (!span) {
              return original.apply(this, arguments);
            }

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

            if (name === 'executeStream') {
              let newResult = original.apply(this, arguments);

              ins.bindEmitter(newResult);
              shimmer.wrap(newResult, 'emit', function (origEmit) {
                return function (event) {
                  switch (event) {
                    case 'error':
                    case 'end':
                      span.end();
                  }
                  return origEmit.apply(this, arguments);
                };
              });
              return newResult;
            } else {
              return new Promise(async (resolve, reject) => {
                let awaitedResult = await original.apply(this, arguments);
                span.end();
                return resolve(awaitedResult);
              });
            }
          };
        }
        shimmer.wrap(newResult, 'execute', wrapPreparedExecute);
        shimmer.wrap(newResult, 'executeStream', wrapPreparedExecute);

        return newResult;
      });
    };
  }
};
