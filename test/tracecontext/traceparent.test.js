/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const crypto = require('crypto');
const test = require('tape');

const { TraceParent } = require('../../lib/tracecontext/traceparent');

const version = Buffer.alloc(1).toString('hex');
const traceId = crypto.randomBytes(16).toString('hex');
const id = crypto.randomBytes(8).toString('hex');
const flags = '01';

const header = `${version}-${traceId}-${id}-${flags}`;

function jsonify(object) {
  return JSON.parse(JSON.stringify(object));
}

function isValid(t, traceParent) {
  t.ok(traceParent instanceof TraceParent, 'has a trace parent object');
  t.ok(/^[\da-f]{2}$/.test(traceParent.version), 'has valid version');
  t.ok(/^[\da-f]{32}$/.test(traceParent.traceId), 'has valid traceId');
  t.ok(/^[\da-f]{16}$/.test(traceParent.id), 'has valid id');
  t.ok(/^[\da-f]{2}$/.test(traceParent.flags), 'has valid flags');
}

test('fromString', (t) => {
  const traceParent = TraceParent.fromString(header);

  isValid(t, traceParent);
  t.equal(traceParent.version, version, 'version matches');
  t.equal(traceParent.traceId, traceId, 'traceId matches');
  t.equal(traceParent.id, id, 'id matches');
  t.equal(traceParent.flags, flags, 'flags matches');

  t.end();
});

test('toString', (t) => {
  const traceParent = TraceParent.fromString(header);

  isValid(t, traceParent);
  t.equal(
    traceParent.toString(),
    header,
    'trace parent stringifies to valid header',
  );

  t.end();
});

test('toJSON', (t) => {
  const traceParent = TraceParent.fromString(header);

  isValid(t, traceParent);
  t.deepEqual(
    jsonify(traceParent),
    {
      version,
      traceId,
      id,
      flags,
      recorded: true,
    },
    'trace parent serializes fields to hex strings, in JSON form',
  );

  t.end();
});

test('startOrResume', (t) => {
  t.test('resume from header', (t) => {
    const traceParent = TraceParent.startOrResume(header);

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.equal(traceParent.traceId, traceId, 'traceId matches');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.flags, flags, 'flags matches');

    t.end();
  });

  t.test('resume from TraceParent', (t) => {
    const traceParent = TraceParent.startOrResume(
      TraceParent.fromString(header),
    );

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.equal(traceParent.traceId, traceId, 'traceId matches');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.flags, flags, 'flags matches');

    t.end();
  });

  t.test('resume from Span-like', (t) => {
    const trans = { _context: TraceParent.fromString(header) };
    const traceParent = TraceParent.startOrResume(trans);

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.equal(traceParent.traceId, traceId, 'traceId matches');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.flags, flags, 'flags matches');

    t.end();
  });

  t.test('start sampled', (t) => {
    const traceParent = TraceParent.startOrResume(null, {
      transactionSampleRate: 1.0,
    });

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.notEqual(traceParent.traceId, traceId, 'has new traceId');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.recorded, true, 'is sampled');

    t.end();
  });

  t.test('start unsampled', (t) => {
    const traceParent = TraceParent.startOrResume(null, {
      transactionSampleRate: 0.0,
    });

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.notEqual(traceParent.traceId, traceId, 'has new traceId');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.recorded, false, 'is sampled');

    t.end();
  });
});

test('child', (t) => {
  t.test('recorded', (t) => {
    const header = `${version}-${traceId}-${id}-01`;
    const traceParent = TraceParent.fromString(header).child();

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.equal(traceParent.traceId, traceId, 'traceId matches');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.flags, '01', 'recorded remains recorded');

    t.end();
  });

  t.test('not recorded', (t) => {
    const header = `${version}-${traceId}-${id}-00`;
    const traceParent = TraceParent.fromString(header).child();

    isValid(t, traceParent);
    t.equal(traceParent.version, version, 'version matches');
    t.equal(traceParent.traceId, traceId, 'traceId matches');
    t.notEqual(traceParent.id, id, 'has new id');
    t.equal(traceParent.flags, '00', 'not recorded remains not recorded');

    t.end();
  });
});

test('ensureParentId', (t) => {
  const traceParent = TraceParent.fromString(header);

  isValid(t, traceParent);
  t.equal(traceParent.version, version, 'version matches');
  t.equal(traceParent.traceId, traceId, 'traceId matches');
  t.equal(traceParent.id, id, 'id matches');
  t.equal(traceParent.flags, flags, 'flags matches');
  t.notOk(traceParent.parentId, 'no parent id before');

  const first = traceParent.ensureParentId();
  t.ok(first, 'returns parent id');
  t.equal(
    traceParent.parentId,
    first,
    'parent id of trace parent matches returned parent id',
  );

  const second = traceParent.ensureParentId();
  t.equal(first, second, 'future calls return the first parent id');

  t.end();
});

test('setRecorded', (t) => {
  const traceParent = TraceParent.fromString(header);

  t.ok(traceParent.recorded);

  traceParent.setRecorded(false);
  t.ok(!traceParent.recorded);

  traceParent.setRecorded(true);
  t.ok(traceParent.recorded);

  t.end();
});
