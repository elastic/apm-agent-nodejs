/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/**
 * Replaces some special values to be printed in stdout or env vars and
 * be revived by the test script or the fixture. These are
 * - Infinity which serializes to `null` by default
 * - RegExp serializes to `{}` by default
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function replacer(key, value) {
  if (value === Infinity) {
    return 'Infinity';
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item instanceof RegExp || typeof item === 'string') {
        return item.toString();
      }
      return item;
    });
  }

  return value;
}

/**
 * Revives values from the serialized JSON with `replacer`
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
function reviver(key, value) {
  if (value === 'Infinity') {
    return Infinity;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' && /^\/.+\/i?$/.test(item)) {
        if (item.endsWith('i')) {
          return new RegExp(item.slice(1, item.length - 2), 'i');
        }
        return new RegExp(item.slice(1, item.length - 1));
      }
      return item;
    });
  }
  return value;
}

module.exports = {
  replacer,
  reviver,
};
