/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const tape = require('tape');

const propwrap = require('../lib/propwrap');

tape.test('wrap basic use case', function (t) {
  t.plan(2);
  const obj = {
    foo: 'bar',
  };
  const newObj = propwrap.wrap(obj, 'foo', (orig) => {
    t.equal(orig, 'bar', 'orig');
    return orig.toUpperCase();
  });
  t.equal(newObj.foo, 'BAR', 'newObj.foo');
  t.end();
});

tape.test('wrap nested subpath', function (t) {
  t.plan(2);
  const obj = {
    deep: {
      nested: {
        foo: 'bar',
      },
    },
  };
  const newObj = propwrap.wrap(obj, 'deep.nested.foo', (orig) => {
    t.equal(orig, 'bar', 'orig');
    return orig.toUpperCase();
  });
  t.equal(newObj.deep.nested.foo, 'BAR', 'newObj.deep.nested.foo');
  t.end();
});

tape.test('wrap property with only a getter', function (t) {
  t.plan(2);
  const obj = {};
  Object.defineProperty(obj, 'foo', {
    value: 'bar',
    writable: false,
  });
  const newObj = propwrap.wrap(obj, 'foo', (orig) => {
    t.equal(orig, 'bar', 'orig');
    return orig.toUpperCase();
  });
  t.equal(newObj.foo, 'BAR', 'newObj.foo');
  t.end();
});

tape.test('wrap property does not exist', function (t) {
  t.plan(2);
  const obj = {
    foo: 'bar',
  };
  try {
    propwrap.wrap(obj, 'baz', (orig) => {
      t.fail('should not call wrapper');
    });
    t.fail('should not get here');
  } catch (wrapErr) {
    t.ok(wrapErr, 'wrapErr');
    t.ok(wrapErr.message.indexOf('baz') !== -1, 'error message mentions "baz"');
  }
  t.end();
});

tape.test('wrap, part of subpath not exist', function (t) {
  t.plan(2);
  const obj = {
    deep: {
      baz: null,
      nested: {
        foo: 'bar',
      },
    },
  };
  try {
    propwrap.wrap(obj, 'deep.baz.foo', (orig) => {
      t.fail('should not call wrapper');
    });
    t.fail('should not get here');
  } catch (wrapErr) {
    t.ok(wrapErr, 'wrapErr');
    t.ok(wrapErr.message.indexOf('baz') !== -1, 'error message mentions "baz"');
  }
  t.end();
});

tape.test('wrap, namespace is not an Object', function (t) {
  t.plan(3);
  const obj = {
    deep: function () {},
  };
  obj.deep.ns = {
    foo: 'bar',
  };

  try {
    propwrap.wrap(obj, 'deep.ns.foo', (orig) => {
      t.fail('should not call wrapper');
    });
    t.fail('should not get here');
  } catch (wrapErr) {
    t.ok(wrapErr, 'wrapErr');
    t.ok(
      wrapErr.message.indexOf('deep') !== -1,
      'error message mentions "deep"',
    );
    t.ok(
      wrapErr.message.indexOf('Object') !== -1,
      'error message mentions "Object"',
    );
  }
  t.end();
});
