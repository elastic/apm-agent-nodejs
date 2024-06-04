/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

var mariadb = require('mariadb/callback');

exports.reset = reset;
exports.credentials = credentials;

var DEFAULTS = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'test_elastic_apm',
};

function credentials(conf) {
  return Object.assign({}, DEFAULTS, conf);
}

function reset(cb) {
  var client = mariadb.createConnection(
    credentials({ database: 'test_elastic_apm' }),
  );

  client.connect(function (err) {
    if (err) throw err;
    client.query('DROP DATABASE IF EXISTS test_elastic_apm', function (err) {
      if (err) throw err;
      client.query('CREATE DATABASE test_elastic_apm', function (err) {
        if (err) throw err;
        client.end(cb);
      });
    });
  });
}
