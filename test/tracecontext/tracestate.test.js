/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

var test = require('tape');

const TraceState = require('../../lib/tracecontext/tracestate');
test('TraceState binary format functionality', function (t) {
  const stringFormat =
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy';
  const tracestate = TraceState.fromStringFormatString(stringFormat);

  const json = tracestate.toObject();

  t.equals(json.foo, '34f067aa0ba902b7', 'preserved value of key foo');
  t.equals(json.bar, '0.25', 'preserved value of key bar');
  t.equals(json.es, 'a:b;cee:de', 'preserved value of key es');
  t.equals(json['34@ree'], 'xxxy', 'preserved value of key 34@ree');

  t.equals(tracestate.getValue('a'), 'b', 'a key parsed from es correctly');
  t.equals(
    tracestate.getValue('cee'),
    'de',
    'cee key parsed from es correctly',
  );

  const string = tracestate.toW3cString();

  const tracestate2 = TraceState.fromStringFormatString(string);

  t.equals(
    string,
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy',
    'w3c string is correct string',
  );

  t.same(tracestate2.toObject(), tracestate.toObject());

  const tracestate3 = TraceState.fromStringFormatString('');
  tracestate3.setValue('a', 1.0);
  tracestate3.setValue('b', 1.1);
  t.equals(
    tracestate3.toW3cString(),
    'es=a:1;b:1.1',
    'can handle numerical types',
  );

  const tracestate4 = TraceState.fromStringFormatString('');
  t.equals(tracestate4.toW3cString(), '', 'no values renders empty');
  t.end();
});

test('TraceState binary format functionality', function (t) {
  const mutableKey = 'mutable-key';
  const tracestate1 = new TraceState();
  t.ok(tracestate1, 'could instantiate TraceState');

  const string =
    '0003666f6f1033346630363761613062613930326237000362617204302e3235';
  const obj = { foo: '34f067aa0ba902b7', bar: '0.25' };
  const tracestate2 = TraceState.fromBinaryFormatHexString(string, mutableKey);
  t.ok(tracestate2, 'could instantiate tracestate from hex string');

  t.equal(tracestate2.toHexString(), string, 'renders as hex string correctly');

  t.same(tracestate2.toObject(), obj, 'renders as object correctly');

  this.ok(tracestate2.setValue('a', 'c'), 'accepts value from mutable key');

  this.ok(
    tracestate2.setValue('blue', 'red'),
    'accepts second value from mutable key',
  );

  this.equals(
    tracestate2.getValue('a'),
    'c',
    'can fetch value from mutable namespace',
  );
  this.equals(
    tracestate2.getValue('blue'),
    'red',
    'can fetch second value from mutable namespace',
  );

  // the es vendor namespace has the value `a:d;blue:red;` in this hex string
  const hexStringWithEsValues =
    '0003666f6f1033346630363761613062613930326237000265730c613a643b626c75653a7265643b000362617204302e3235';

  const tracestate3 = TraceState.fromBinaryFormatHexString(
    hexStringWithEsValues,
    'es',
  );
  this.equals(
    tracestate3.getValue('a'),
    'd',
    'can fetch mutable namespace value set from start',
  );

  this.equals(
    tracestate3.getValue('blue'),
    'red',
    'can fetch mutable namespace value set from start',
  );

  tracestate3.setValue('a', 'c');
  this.equals(
    tracestate3.getValue('a'),
    'c',
    'can overwrite value set in initial buffer',
  );

  tracestate3.setValue('a', 'c');
  this.equals(
    tracestate3.getValue('blue'),
    'red',
    'overwriten value does not effect others set',
  );
  t.end();
});

test('TraceState binary format serializing', function (t) {
  // hex string with no es value
  const string =
    '0003666f6f1033346630363761613062613930326237000362617204302e3235';
  const tracestate = TraceState.fromBinaryFormatHexString(string, 'es');
  tracestate.setValue('foo', 'bar');
  tracestate.setValue('zip', 'zap');
  const newString = tracestate.toHexString();

  const tracestate2 = TraceState.fromBinaryFormatHexString(newString, 'es');

  // the new values should be fetchable
  t.equals(
    tracestate2.getValue('foo'),
    'bar',
    'value was serialized/unserialized correctly',
  );
  t.equals(
    tracestate2.getValue('zip'),
    'zap',
    'value was serialized/unserialized correctly',
  );

  const json = tracestate2.toObject();

  // the non-es raw values should be untouched
  t.equals(json.foo, '34f067aa0ba902b7', 'foo vendor untouched');
  t.equals(json.bar, '0.25', 'bar vendor untouched');

  t.end();
});

test('TraceState format validation', function (t) {
  const didCreatingTraceStateThrow = (buffer, ns) => {
    try {
      const t2 = new TraceState(buffer, ns);
      t.ok(t2, 'create TraceState without throwing');
    } catch (e) {
      return true;
    }
    return false;
  };

  const justFits = new Array(256 + 1).join('x');
  const tooBig = new Array(257 + 1).join('x');
  const validVendorKey = [
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '_-*/',
  ].join('');
  const invalidVendorKey = [
    'abcdefghijklmnopqrstuvwxyz',
    ':',
    '0123456789',
    '_-*/',
  ].join('');
  const buffer = Buffer.from([]);

  t.ok(
    !didCreatingTraceStateThrow(buffer, justFits),
    'vendor namespace of 256 characters allowed',
  );

  t.ok(
    didCreatingTraceStateThrow(buffer, tooBig),
    'TraceState refuses to instantiate vendor namespace of 257 characters',
  );

  t.ok(
    !didCreatingTraceStateThrow(buffer, validVendorKey),
    'TraceState instantiates with valid vendor namespae',
  );

  t.ok(
    didCreatingTraceStateThrow(buffer, invalidVendorKey),
    'TraceState refusees to instantiate with invalid vendor namespae',
  );

  t.ok(
    didCreatingTraceStateThrow(buffer, 'fo=o'),
    'TraceState refusees to instantiate with invalid vendor namespae fo=o',
  );

  t.ok(
    didCreatingTraceStateThrow(buffer, 'fo,o'),
    'TraceState refusees to instantiate with invalid vendor namespae fo,o',
  );

  const t1 = new TraceState(buffer, 'es');
  t.ok(!t1.setValue('f:oo', 'bar'), 'failed to set invalid key f:oo');
  t.ok(!t1.setValue('foo-colon', 'ba:r'), 'failed to set invalid value ba:r');
  t.ok(!t1.setValue('f;oo', 'bar'), 'failed to set invalid key bar');
  t.ok(
    !t1.setValue('foo-semicolon', 'b;ar'),
    'failed to set invalid value b;ar',
  );
  t.ok(!t1.setValue('f,oo', 'bar'), 'failed to set invalid key f,oo');
  t.ok(!t1.setValue('foo-comma', 'b,ar'), 'failed to set invalid value b,ar');
  t.ok(!t1.setValue('f=oo', 'bar'), 'failed to set invalid key f=oo');
  t.ok(!t1.setValue('foo-equals', 'b,ar'), 'failed to set invalid value b,ar');

  t.ok(!t1.setValue('foo-toolong', tooBig), 'failed to set value > 256 chars');
  t.ok(!t1.setValue(tooBig, 'foo'), 'failed to set key > 256 chars');

  t.ok(t1.setValue('foo', 'bar'), 'set valid key and value');

  t.ok(!t1.getValue('f:oo'), 'did not set invalid key f:oo');
  t.ok(!t1.getValue('f;oo'), 'did not set invalid key f;oo');
  t.ok(!t1.getValue(tooBig), 'did not set super long key');
  t.ok(
    !t1.getValue('foo-colon'),
    'did not set invalid value for foo-colon key',
  );
  t.ok(
    !t1.getValue('foo-semicolon'),
    'did not set invalid value for foo-semicolon key',
  );
  t.ok(
    !t1.getValue('foo-comma'),
    'did not set invalid value for foo-comma key',
  );
  t.ok(
    !t1.getValue('foo-equals'),
    'did not set invalid value for foo-equals key',
  );
  t.ok(
    !t1.getValue('foo-toolong'),
    'did not set invalid value for foo-toolong key',
  );

  t.equals(t1.getValue('foo'), 'bar', 'did set valid value');

  const t2 = new TraceState(Buffer.from([]), 'es');
  t2.setValue('foo', 'bar');
  t2.setValue('zip', 'zap');
  // now, set a key and value that are <257 characters, but that
  // would result in the entire `es` value being greater than 256
  const oneTwenty = new Array(120 + 1).join('x');
  t.ok(
    !t2.setValue(oneTwenty, oneTwenty),
    'call to setValue returned false when key too long',
  );
  t.equals(t2.getValue('foo'), 'bar', 'maintained value of foo key');
  t.equals(t2.getValue('zip'), 'zap', 'maintained value of zip key');
  t.ok(
    !t2.getValue(oneTwenty),
    'did not set key/value that would put us over total character limit',
  );

  // same as t2 test, but oneTwenty key is previously set
  const t3 = new TraceState(Buffer.from([]), 'es');
  t3.setValue('foo', 'bar');
  t3.setValue('zip', 'zap');
  t3.setValue(oneTwenty, 'bees');
  // now, set a key and value that are <257 characters, but that
  // would result in the entire `es` value being greater than 256

  t3.setValue(oneTwenty, oneTwenty);
  t.equals(t3.getValue('foo'), 'bar', 'maintained value of foo key');
  t.equals(t3.getValue('zip'), 'zap', 'maintained value of zip key');
  t.equals(t3.getValue(oneTwenty), 'bees', 'maintained value of zip key');

  t.end();
});

test('TraceState delimiter edge cases', function (t) {
  // makes sure weird stuff doesn't blow anything up
  const stringFormats = [
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy',
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy,',
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,;34@ree=xxxy,',
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de;,34@ree=xxxy,',
    'foo=34f067aa0ba902b7,,bar=0.25,es=a:b;;cee:de,34@ree=xxxy;',
    'foo=34f067aa,0ba902b7,,bar=0.25,es=a:b;;cee:de,34@ree=xxxy;',
    'foo=34f067aa,0ba9,02b7,,bar=0.25,es=a:b;;;cee:de,,,34@ree=xxxy;',
    'foo=34f067aa0ba902b7,bar=0.25,es=a::b;cee:de,34@ree=xxxy',
    'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,es=xxxy',
  ];
  for (const [, format] of stringFormats.entries()) {
    t.ok(TraceState.fromStringFormatString(format));
  }

  t.end();
});

test('TraceState examples', function (t) {
  const examples = [
    {
      // Whitespace (OWS) handling
      s: '\tacme=foo:bar;spam:eggs , es=k:v ,, ,\t',
      expect: { acme: 'foo:bar;spam:eggs', es: 'k:v' },
    },
  ];
  examples.forEach((ex) => {
    const ts = TraceState.fromStringFormatString(ex.s);
    t.deepEqual(ts.toObject(), ex.expect);
  });

  t.end();
});

test('TraceState W3C Order', function (t) {
  // Vendors receiving a tracestate request header MUST
  // send it to outgoing requests. It MAY mutate the value
  // of this header before passing to outgoing requests.
  // When mutating tracestate, the order of unmodified
  // key/value pairs MUST be preserved. Modified keys MUST
  // be moved to the beginning (left) of the list.

  const string = 'foo=34f067aa0ba902b7,bar=0.25,es=a:b;cee:de,34@ree=xxxy';
  const stringIfModified =
    'es=a:b;cee:d,foo=34f067aa0ba902b7,bar=0.25,34@ree=xxxy';

  const tracestate = TraceState.fromStringFormatString(string);
  const map = tracestate.toMap();
  t.ok(map.get('es'), 'a:b;cee:de', 'toMap method works');
  // t.equals(tracestate.toW3cString(), string, 'unmodified tracestate remains in same order order')

  const tracestate2 = TraceState.fromStringFormatString(string);
  tracestate2.setValue('cee', 'd');
  t.equals(
    tracestate2.toW3cString(),
    stringIfModified,
    'modified tracestate shifts modified key to left side',
  );

  t.end();
});

test('TraceState defaultValues', function (t) {
  const tracestate = new TraceState(Buffer.from('', 'hex'), 'es', {
    foo: 'bar',
    zip: 'zap',
  });
  t.equals(
    tracestate.getValue('foo'),
    'bar',
    'default value foo set correctly',
  );
  t.equals(
    tracestate.getValue('zip'),
    'zap',
    'default value zap set correctly',
  );
  t.equals(tracestate.toW3cString(), 'es=foo:bar;zip:zap');
  t.equals(
    tracestate.toHexString(),
    '000265730f666f6f3a6261723b7a69703a7a6170',
  );

  // hex string has foo=bar and zip=zap in binary format
  const tracestate2 = new TraceState(
    Buffer.from('000265730f666f6f3a6261723b7a69703a7a6170', 'hex'),
    'es',
    { foo: 'bar2', zip: 'zap2' },
  );

  t.equals(
    tracestate2.getValue('foo'),
    'bar2',
    'prefers defaultValues over binary in constructor',
  );
  t.equals(
    tracestate2.getValue('zip'),
    'zap2',
    'prefers defaultValues over binary in constructor',
  );
  t.equals(
    tracestate2.toW3cString(),
    'es=foo:bar2;zip:zap2',
    'prefers defautlValues over binary in constructor',
  );
  t.end();
});

test('TraceState empty or invalid values', function (t) {
  const tracestateEmpty = TraceState.fromStringFormatString('');
  t.ok(
    undefined === tracestateEmpty.getValue('s'),
    'does not crash for empty tracestate',
  );

  const tracestateInvalid = TraceState.fromStringFormatString('xxxxxx');
  t.ok(
    undefined === tracestateInvalid.getValue('s'),
    'does not crash for invalid tracestate',
  );

  t.end();
});
