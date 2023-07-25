/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Validate an APM server intake object against its schema.
//
// Usage example:
//    const { validateSpan } = require('./_validate_schema')
//    const errs = validateSpan(mySpanObj)
// `errs` is null if mySpanObj is valid, else it is an array of ajv ErrorObject.

const fs = require('fs');
const { join } = require('path');

const Ajv = require('ajv').default;

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: true });
const schemaDir = join(
  __dirname,
  'integration',
  'api-schema',
  'apm-server-schema',
);

/**
 * Create a validator function for the given APM Server intake type (e.g.
 * 'span', 'metadata').
 *
 * @returns {(data: object) => null | ajv.ErrorObject[]}
 */
function createValidator(apmType, cb) {
  const schemaPath = join(schemaDir, apmType + '.json');
  const content = fs.readFileSync(schemaPath, { encoding: 'utf8' });
  const schema = JSON.parse(content);
  const validate = ajv.compile(schema);

  return function (data) {
    const valid = validate(data);
    if (valid) {
      return null;
    } else {
      return validate.errors;
    }
  };
}

module.exports = {
  validateMetadata: createValidator('metadata'),
  validateTransaction: createValidator('transaction'),
  validateSpan: createValidator('span'),
  validateError: createValidator('error'),
  validateMetricset: createValidator('metricset'),
};
