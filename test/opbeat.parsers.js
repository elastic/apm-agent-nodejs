'use strict';

var assert = require('assert');
var semver = require('semver');
var opbeat = require('../');
opbeat.parsers = require('../lib/parsers');

describe('opbeat.parsers', function () {
  describe('#parseMessage()', function () {
    it('should parse string', function () {
      var options = {};
      opbeat.parsers.parseMessage('Howdy', options);
      assert.strictEqual(options.message, 'Howdy');
    });

    it('should parse object', function () {
      var options = {};
      opbeat.parsers.parseMessage({ message: 'foo%s', params: ['bar'] }, options);
      assert.strictEqual(options.message, 'foobar');
      assert.strictEqual(options.param_message, 'foo%s');
    });
  });

  describe('#parseRequest()', function () {
    it('should parse a request object', function () {
      var mockReq = {
        method: 'GET',
        url: '/some/path?key=value',
        headers: {
          host: 'mattrobenolt.com'
        },
        body: '',
        cookies: {},
        socket: {
          encrypted: true
        }
      };
      var parsed = opbeat.parsers.parseRequest(mockReq);
      assert('http' in parsed);
      assert.strictEqual(parsed.http.url, 'https://mattrobenolt.com/some/path?key=value');
    });
  });

  describe('#parseError()', function () {
    it('should parse plain Error object', function (done) {
      opbeat.parsers.parseError(new Error(), {}, function (parsed) {
        assert.strictEqual(parsed.message, 'Error: <no message>');
        assert('exception' in parsed);
        assert.strictEqual(parsed.exception.type, 'Error');
        assert.strictEqual(parsed.exception.value, '');
        assert('stacktrace' in parsed);
        assert('frames' in parsed.stacktrace);
        done();
      });
    });

    it('should parse Error with message', function (done) {
      opbeat.parsers.parseError(new Error('Crap'), {}, function (parsed) {
        assert.strictEqual(parsed.message, 'Error: Crap');
        assert('exception' in parsed);
        assert.strictEqual(parsed.exception.type, 'Error');
        assert.strictEqual(parsed.exception.value, 'Crap');
        assert('stacktrace' in parsed);
        assert('frames' in parsed.stacktrace);
        done();
      });
    });

    it('should parse TypeError with message', function (done) {
      opbeat.parsers.parseError(new TypeError('Crap'), {}, function (parsed) {
        assert.strictEqual(parsed.message, 'TypeError: Crap');
        assert('exception' in parsed);
        assert.strictEqual(parsed.exception.type, 'TypeError');
        assert.strictEqual(parsed.exception.value, 'Crap');
        assert('stacktrace' in parsed);
        assert('frames' in parsed.stacktrace);
        done();
      });
    });

    it('should parse thrown Error', function (done) {
      try {
        throw new Error('Derp');
      } catch(e) {
        opbeat.parsers.parseError(e, {}, function (parsed) {
          assert.strictEqual(parsed.message, 'Error: Derp');
          assert('exception' in parsed);
          assert.strictEqual(parsed.exception.type, 'Error');
          assert.strictEqual(parsed.exception.value, 'Derp');
          assert('stacktrace' in parsed);
          assert('frames' in parsed.stacktrace);
          done();
        });
      }
    });

    it('should parse caught real error', function (done) {
      try {
        var o = {};
        o['...']['Derp']();
      } catch(e) {
        opbeat.parsers.parseError(e, {}, function (parsed) {
          var msg = semver.lt(process.version, '0.11.0') ?
            'Cannot call method \'Derp\' of undefined' :
            'Cannot read property \'Derp\' of undefined';
          assert.strictEqual(parsed.message, 'TypeError: ' + msg);
          assert('exception' in parsed);
          assert.strictEqual(parsed.exception.type, 'TypeError');
          assert.strictEqual(parsed.exception.value, msg);
          assert('stacktrace' in parsed);
          assert('frames' in parsed.stacktrace);
          done();
        });
      }
    });
  });
});
