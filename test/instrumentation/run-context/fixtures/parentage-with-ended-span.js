/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// This exercises two subtle cases of run context management around when an
// *ended* span is considered the `currentSpan`.
//
// Expected:
//  - transaction "t0"
//    - span "s1"
//      - span "s3"
//    - span "s2"

const apm = require('../../../../').start({
  // elastic-apm-node
  captureExceptions: false,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'run-context-parentage-with-ended-span',
});

let assert = require('assert');
if (Number(process.versions.node.split('.')[0]) > 8) {
  assert = assert.strict;
}

const t0 = apm.startTransaction('t0');
const s1 = apm.startSpan('s1');

setImmediate(function doSomething() {
  // Case #1: Ending a span removes it from the **current** run context. Doing
  // so does *not* effect the run context for `doAnotherThing()` below, because
  // run contexts are immutable.
  s1.end();
  assert(s1.ended && apm.currentSpan === null);
  // This means that new spans and run contexts created in this async task
  // will no longer use s1.
  const s2 = apm.startSpan('s2');
  assert(
    s2.parentId !== s1,
    's2 parent is NOT s1, because s1 ended in this async task',
  );
  setImmediate(function () {
    s2.end();
  });
});

setImmediate(function doAnotherThing() {
  // Case #2: This async task was bound to s1 when it was added to the event
  // loop queue. It does not (and should not) matter that s1 happens to have
  // ended by the time this async task is executed.
  assert(s1.ended && apm.currentSpan === s1);
  // This means that s1 **is** used for new spans and run contexts.
  const s3 = apm.startSpan('s3');
  assert(s3.parentId === s1.id, 's3 parent is s1, even though s1 ended');
  setImmediate(function () {
    s3.end();
    assert(apm.currentSpan === s1);
    t0.end();
  });
});
