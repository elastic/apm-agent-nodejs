/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const pino = require('pino');
const test = require('tape');

const logging = require('../lib/logging');

test('default logLevel is "info"', function (t) {
  const log = logging.createLogger();
  t.equal(log.level, 'info');
  t.end();
});

test('simple custom logger works', function (t) {
  class SimpleCustomLogger {
    constructor() {
      this.records = [];
    }

    _log(level, message) {
      this.records.push({ level, message });
    }

    fatal(message) {
      this._log('fatal', message);
    }
    error(message) {
      this._log('error', message);
    }
    warn(message) {
      this._log('warn', message);
    }
    info(message) {
      this._log('info', message);
    }
    debug(message) {
      this._log('debug', message);
    }
    trace(message) {
      this._log('trace', message);
    }
  }

  const customLogger = new SimpleCustomLogger();
  const log = logging.createLogger(null, customLogger);

  // Note that we expect this `metadatum` to *not* get through to the
  // custom logger.
  log.info({ metadatum: 42 }, 'testing %d %j %o...', 1, 2, 3);
  t.equal(customLogger.records.length, 1);
  const rec = customLogger.records[0];
  t.equal(rec.level, 'info');
  t.equal(rec.message, 'testing 1 2 3...');

  t.end();
});

test('pino custom logger gets structured fields', function (t) {
  // Use a custom destination for our pino logger to capture writes, so we
  // can test the output.
  const captureStream = {
    chunks: [],
    write(chunk) {
      this.chunks.push(chunk);
    },
    getRecords() {
      const lines = this.chunks.join('').trim().split(/\n/g);
      return lines.map(JSON.parse);
    },
  };
  const customLogger = pino({}, captureStream);
  const log = logging.createLogger(null, customLogger);

  log.info({ metadatum: 42 }, 'testing %d %j %o...', 1, 2, 3);
  log.warn({ err: new Error('boom') }, 'got an error');

  const recs = captureStream.getRecords();
  t.equal(recs.length, 2);
  t.equal(recs[0].level, 30); // pino's levelVal for "info"
  t.equal(recs[0].msg, 'testing 1 2 3...');
  t.equal(
    recs[0].metadatum,
    42,
    'custom pino logger got structured "metadatum" log field',
  );
  t.equal(recs[1].level, 40); // pino's levelVal for "warn"
  t.equal(
    recs[1].err.type,
    'Error',
    'custom pino logger got structured err.type',
  );
  t.equal(
    recs[1].err.message,
    'boom',
    'custom pino logger got structured err.message',
  );
  t.ok(recs[1].err.stack, 'custom pino logger got structured err.stack');

  t.end();
});
