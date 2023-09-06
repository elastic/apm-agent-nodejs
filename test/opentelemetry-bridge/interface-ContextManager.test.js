/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

// Exercise the full `interface ContextManager`.

require('../..').start({
  opentelemetryBridgeEnabled: true,
  // Make the agent quiet.
  disableSend: true,
  centralConfig: false,
  cloudProvider: 'none',
  metricsInterval: '0s',
  captureExceptions: false,
  logLevel: 'off',
});

const otel = require('@opentelemetry/api');
const tape = require('tape');
const EventEmitter = require('events');

const FOO_KEY = otel.createContextKey('FOO');
const tracer = otel.trace.getTracer('test-interface-ContextManager');

tape.test('ContextManager.active()', (t) => {
  tracer.startActiveSpan('aSpan', (aSpan) => {
    const currSpan = otel.trace.getSpan(otel.context.active());
    t.deepEqual(currSpan.spanContext(), aSpan.spanContext());
    aSpan.end();
    t.end();
  });
});

tape.test('ContextManager.with(context, fn, thisArg?, ...args)', (t) => {
  const s1 = tracer.startSpan('s1');
  const ctx = otel.trace
    .setSpan(otel.context.active(), s1)
    .setValue(FOO_KEY, 'bar');
  const thisArg = { aProp: 'aPropVal' };
  const fn = function (one, two, three) {
    const activeCtx = otel.context.active();
    t.strictEqual(activeCtx, ctx, 'active context');
    t.strictEqual(
      activeCtx.getValue(FOO_KEY),
      'bar',
      'FOO_KEY in active context',
    );
    t.strictEqual(this, thisArg, 'thisArg');
    t.strictEqual(one, 1, 'arg 1');
    t.strictEqual(two, 2, 'arg 2');
    t.strictEqual(three, 3, 'arg 3');
    t.strictEqual(arguments[3], 4, 'arg 4');
    return 'theRetval';
  };

  const retval = otel.context.with(ctx, fn, thisArg, 1, 2, 3, 4);
  t.strictEqual(retval, 'theRetval', 'fn return value');
  t.end();
});

tape.test('ContextManager.bind(context, fn)', (suite) => {
  suite.test(
    'should return the same thing if not a function or EventEmitter',
    (t) => {
      const notAFn = { foo: 'bar' };
      const bound = otel.context.bind(otel.context.active(), notAFn);
      t.strictEqual(bound, notAFn);
      t.end();
    },
  );

  suite.test('should bind a function to given context', (t) => {
    const ctx = otel.context.active().setValue(FOO_KEY, 'bar');
    const fn = function () {
      t.strictEqual(otel.context.active(), ctx, 'active context in bound fn');
      return 'theRetval';
    };
    const bound = otel.context.bind(ctx, fn);
    const retval = bound();
    t.strictEqual(retval, 'theRetval', 'fn return value');
    t.end();
  });

  suite.end();
});

tape.test('ContextManager.bind(context, eventEmitter)', (suite) => {
  suite.test(
    'should bind a function to given EventEmitter, removeListeners works',
    (t) => {
      t.plan(2);
      const ctx = otel.context.active().setValue(FOO_KEY, 'bar');
      const ee = new EventEmitter();
      const boundEE = otel.context.bind(ctx, ee);
      const handler = () => {
        t.strictEqual(otel.context.active(), ctx, 'active context in bound fn');
      };
      boundEE.on('anEvent', handler);
      boundEE.emit('anEvent');
      boundEE.emit('anEvent');
      boundEE.removeListener('anEvent', handler);
      boundEE.emit('anEvent'); // should not call the handler, hence t.plan(2)
      t.end();
    },
  );

  suite.test('same handler on multiple events works', (t) => {
    t.plan(2);
    const ctx = otel.context.active().setValue(FOO_KEY, 'bar');
    const ee = new EventEmitter();
    const boundEE = otel.context.bind(ctx, ee);
    const handler = () => {
      t.strictEqual(otel.context.active(), ctx, 'active context in bound fn');
    };
    boundEE.on('event1', handler);
    boundEE.on('event2', handler);
    boundEE.emit('event1');
    boundEE.emit('event2');
    boundEE.removeListener('event1', handler);
    boundEE.removeListener('event2', handler);
    boundEE.emit('event1');
    boundEE.emit('event2');
    t.end();
  });

  suite.end();
});

// Basically just testing that this doesn't blow up. `ContextManager.enable()`
// isn't exposed in the public `@opentelemetry/api` directly, so that isn't
// tested here.
tape.test('ContextManager.disable()', (t) => {
  otel.context.disable();
  t.end();
});
