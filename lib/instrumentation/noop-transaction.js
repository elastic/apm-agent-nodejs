/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('../constants');

const NOOP_TRANSACTION_ID = '0000000000000000';
const NOOP_TRACEID = '00000000000000000000000000000000';
const NOOP_TRACEPARENT = '00-00000000000000000000000000000-0000000000000000-00';

/**
 * A do-nothing Transaction object.
 * https://www.elastic.co/guide/en/apm/agent/nodejs/current/transaction-api.html
 */
class NoopTransaction {
  constructor() {
    this.name = 'unnamed';
    this.type = 'noop';
    this.traceparent = NOOP_TRACEPARENT;
    this.result = constants.RESULT_SUCCESS;
    this.outcome = constants.OUTCOME_UNKNOWN;
    this.ids = {
      'trace.id': NOOP_TRACEID,
      'transaction.id': NOOP_TRANSACTION_ID,
    };

    // Unofficial properties mentioned in a comment in index.d.ts.
    this.timestamp = Date.now();
    this.id = NOOP_TRANSACTION_ID;
    this.traceId = NOOP_TRACEID;
    this.sampled = false;
    this.ended = false;
  }

  // Public methods.
  setType() {}
  setLabel() {
    return true;
  }
  addLabels() {
    return true;
  }
  setOutcome() {}
  startSpan() {
    return null;
  }
  end() {}
  ensureParentId() {
    return NOOP_TRANSACTION_ID;
  }
  toString() {
    return `Transaction(${this.id}, '${this.name}'${
      this.ended ? ', ended' : ''
    })`;
  }

  // Non-public methods mentioned in a comment in index.d.ts.
  setUserContext() {}
  setCustomContext() {}
  setDefaultName() {}
  setDefaultNameFromRequest() {}
  toJSON() {
    return {};
  }
  duration() {
    return 0;
  }
}

module.exports = {
  NoopTransaction,
};
