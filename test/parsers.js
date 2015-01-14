'use strict';

var test = require('tape');
var semver = require('semver');
var parsers = require('../lib/parsers');

test('#parseMessage()', function (t) {
  t.test('should parse string', function (t) {
    var options = {};
    parsers.parseMessage('Howdy', options);
    t.equal(options.message, 'Howdy');
    t.end();
  });

  t.test('should parse object', function (t) {
    var options = {};
    parsers.parseMessage({ message: 'foo%s', params: ['bar'] }, options);
    t.equal(options.message, 'foobar');
    t.equal(options.param_message, 'foo%s');
    t.end();
  });

  t.test('should parse an invalid object', function (t) {
    var options = {};
    parsers.parseMessage({ foo: /bar/ }, options);
    t.equal(options.message, '{ foo: /bar/ }');
    t.end();
  });
});

test('#parseRequest()', function (t) {
  t.test('should parse a request object', function () {
    var mockReq = {
      method: 'GET',
      url: '/some/path?key=value',
      headers: {
        host: 'example.com'
      },
      body: '',
      cookies: {},
      socket: {
        encrypted: true
      }
    };
    var parsed = parsers.parseRequest(mockReq);
    t.ok('http' in parsed);
    t.equal(parsed.http.url, 'https://example.com/some/path?key=value');
    t.end();
  });
});

test('#parseError()', function (t) {
  t.test('should parse plain Error object', function (t) {
    parsers.parseError(new Error(), {}, function (parsed) {
      t.equal(parsed.message, 'Error: <no message>');
      t.ok('exception' in parsed);
      t.equal(parsed.exception.type, 'Error');
      t.equal(parsed.exception.value, '');
      t.ok('stacktrace' in parsed);
      t.ok('frames' in parsed.stacktrace);
      t.end();
    });
  });

  t.test('should parse Error with message', function (t) {
    parsers.parseError(new Error('Crap'), {}, function (parsed) {
      t.equal(parsed.message, 'Error: Crap');
      t.ok('exception' in parsed);
      t.equal(parsed.exception.type, 'Error');
      t.equal(parsed.exception.value, 'Crap');
      t.ok('stacktrace' in parsed);
      t.ok('frames' in parsed.stacktrace);
      t.end();
    });
  });

  t.test('should parse TypeError with message', function (t) {
    parsers.parseError(new TypeError('Crap'), {}, function (parsed) {
      t.equal(parsed.message, 'TypeError: Crap');
      t.ok('exception' in parsed);
      t.equal(parsed.exception.type, 'TypeError');
      t.equal(parsed.exception.value, 'Crap');
      t.ok('stacktrace' in parsed);
      t.ok('frames' in parsed.stacktrace);
      t.end();
    });
  });

  t.test('should parse thrown Error', function (t) {
    try {
      throw new Error('Derp');
    } catch(e) {
      parsers.parseError(e, {}, function (parsed) {
        t.equal(parsed.message, 'Error: Derp');
        t.ok('exception' in parsed);
        t.equal(parsed.exception.type, 'Error');
        t.equal(parsed.exception.value, 'Derp');
        t.ok('stacktrace' in parsed);
        t.ok('frames' in parsed.stacktrace);
        t.end();
      });
    }
  });

  t.test('should parse caught real error', function (t) {
    try {
      var o = {};
      o['...']['Derp']();
    } catch(e) {
      parsers.parseError(e, {}, function (parsed) {
        var msg = semver.lt(process.version, '0.11.0') ?
          'Cannot call method \'Derp\' of undefined' :
          'Cannot read property \'Derp\' of undefined';
        t.equal(parsed.message, 'TypeError: ' + msg);
        t.ok('exception' in parsed);
        t.equal(parsed.exception.type, 'TypeError');
        t.equal(parsed.exception.value, msg);
        t.ok('stacktrace' in parsed);
        t.ok('frames' in parsed.stacktrace);
        t.end();
      });
    }
  });
});
