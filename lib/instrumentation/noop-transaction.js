/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('../constants');

module.exports = NoopTransaction;

const NOOP_TRANSACTION_ID = '0000000000000000';
const NOOP_TRACEID = '00000000000000000000000000000000';
const NOOP_TRACEPARENT = '00-00000000000000000000000000000-0000000000000000-00';

// Usage:
//    new NoopTransaction()
function NoopTransaction() {
  // Public properties:
  // https://www.elastic.co/guide/en/apm/agent/nodejs/current/transaction-api.html
  this.name = 'Noop Transaction';
  this.type = 'noop';
  this.subtype = undefined;
  this.action = undefined;
  this.traceparent = NOOP_TRACEPARENT;
  this.result = constants.RESULT_SUCCESS;
  this.outcome = 'unknown';
  this.ids = {
    'trace.id': NOOP_TRACEID,
    'transaction.id': NOOP_TRANSACTION_ID,
  };

  // Non official mentioned in index.d.ts
  this.timestamp = Date.now();
  this.id = NOOP_TRANSACTION_ID;
  this.traceId = NOOP_TRACEID;
  this.sampled = false;
  this.ended = false;
}

// Public methods:
// https://www.elastic.co/guide/en/apm/agent/nodejs/current/transaction-api.html
NoopTransaction.prototype.setType = returnVoid;
NoopTransaction.prototype.setLabel = returnTrue;
NoopTransaction.prototype.addLabels = returnTrue;
NoopTransaction.prototype.setOutcome = returnVoid;
NoopTransaction.prototype.startSpan = returnNull;
NoopTransaction.prototype.end = returnVoid;
NoopTransaction.prototype.ensureParentId = function () {
  return '00000000';
};
NoopTransaction.prototype.toString = function () {
  return `Transaction(${this.id}, '${this.name}'${
    this.ended ? ', ended' : ''
  })`;
};

// Non public methods mentioned in index.d.ts
NoopTransaction.prototype.setUserContext = returnVoid;
NoopTransaction.prototype.setCustomContext = returnVoid;
NoopTransaction.prototype.setDefaultName = returnVoid;
NoopTransaction.prototype.setDefaultNameFromRequest = returnVoid;
NoopTransaction.prototype.toJSON = function () {
  return {};
};
NoopTransaction.prototype.duration = function () {
  return 0;
};

function returnVoid() {}
function returnTrue() {
  return true;
}
function returnNull() {
  return null;
}
