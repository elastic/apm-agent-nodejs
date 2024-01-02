/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const Fiber = require('fibers');

const { BasicRunContextManager } = require('./BasicRunContextManager');

class FibersContextStore {
  getStore() {
    return Fiber.current;
  }

  run(store, callback, ...args) {
    if (args.length >= 1) {
      return Fiber((...rest) => {
        const fiber = Fiber.current;
        for (const key in store) {
          if (store.hasOwnProperty(key)) {
            fiber[key] = store[key];
          }
        }

        Fiber.yield(callback(...rest));
      }).run(args);
    }
    // eslint-disable-next-line new-cap
    return Fiber((...rest) => {
      const fiber = Fiber.current;
      for (const key in store) {
        if (store.hasOwnProperty(key)) {
          fiber[key] = store[key];
        }
      }

      Fiber.yield(callback(...rest));
    }).run();
  }
}

/**
 * A RunContextManager that uses core node `AsyncLocalStorage` as the mechanism
 * for run-context tracking.
 *
 * (Adapted from https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts)
 */
class FibersContextManager extends BasicRunContextManager {
  constructor(log, runContextClass) {
    super(log, runContextClass);
    this._runContextFromAsyncId = new Map();
    this._asyncLocalStorage = new FibersContextStore();
  }

  enable() {
    super.enable();
    return this;
  }

  disable() {
    super.disable();
    this._runContextFromAsyncId.clear();
    const store = this._asyncLocalStorage.getStore();
    if (store) store.reset();
    return this;
  }

  // Reset state for re-use of this context manager by tests in the same process.
  testReset() {
    this.disable();
    this._stack = [];
  }

  active() {
    // const store = this._asyncLocalStorage.getStore();
    const store = this._stack[this._stack.length - 1];
    if (store == null) {
      return this.root();
    } else {
      return store;
    }
  }

  with(runContext, fn, thisArg, ...args) {
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(runContext, cb, ...args);
  }

  /**
   * Init hook will be called when userland create a async context, setting the
   * context as the current one if it exist.
   * @param asyncId id of the async context
   * @param type the resource type
   */
  _init(asyncId, type, triggerAsyncId) {
    // ignore TIMERWRAP as they combine timers with same timeout which can lead to
    // false context propagation. TIMERWRAP has been removed in node 11
    // every timer has it's own `Timeout` resource anyway which is used to propagete
    // context.
    if (type === 'TIMERWRAP') {
      return;
    }

    const context = this._stack[this._stack.length - 1];
    if (context !== undefined) {
      this._runContextFromAsyncId.set(asyncId, context);
    }
  }

  /**
   * Destroy hook will be called when a given context is no longer used so we can
   * remove its attached context.
   * @param asyncId id of the async context
   */
  _destroy(asyncId) {
    this._runContextFromAsyncId.delete(asyncId);
  }

  /**
   * Before hook is called just before executing a async context.
   * @param asyncId id of the async context
   */
  _before(asyncId) {
    const context = this._runContextFromAsyncId.get(asyncId);
    if (context !== undefined) {
      this._enterRunContext(context);
    }
  }

  /**
   * After hook is called just after completing the execution of a async context.
   */
  _after() {
    this._exitRunContext();
  }
}

module.exports = {
  FibersContextManager,
};
