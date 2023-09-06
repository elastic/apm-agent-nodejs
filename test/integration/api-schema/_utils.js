/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const fs = require('fs');
const { join } = require('path');

const Ajv = require('ajv').default;
const thunky = require('thunky');

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: true });
const schemaDir = join(__dirname, 'apm-server-schema');

exports.metadataValidator = thunky(function (cb) {
  loadSchema('metadata.json', cb);
});

exports.transactionValidator = thunky(function (cb) {
  loadSchema('transaction.json', cb);
});

exports.spanValidator = thunky(function (cb) {
  loadSchema('span.json', cb);
});

exports.errorValidator = thunky(function (cb) {
  loadSchema('error.json', cb);
});

function loadSchema(schemaFileName, cb) {
  const schemaPath = join(schemaDir, schemaFileName);
  fs.readFile(schemaPath, { encoding: 'utf8' }, function (readErr, content) {
    if (readErr) {
      cb(readErr);
      return;
    }

    let schema;
    try {
      schema = JSON.parse(content);
    } catch (parseErr) {
      cb(parseErr);
      return;
    }

    const validator = ajv.compile(schema);
    cb(null, validator);
  });
}
