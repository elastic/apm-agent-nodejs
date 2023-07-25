/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

process.addListener('unhandledRejection', handler);

exports.remove = function stop() {
  process.removeListener('unhandledRejection', handler);
};

function handler(promise, reason) {
  console.error('Unhandled Rejection at:', promise, '\nreason:', reason);
  process.exit(1);
}
