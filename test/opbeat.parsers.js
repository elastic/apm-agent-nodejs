'use strict';

var semver = require('semver');
var opbeat = require('../');
opbeat.parsers = require('../lib/parsers');

describe('opbeat.parsers', function () {
  describe('#parseMessage()', function () {
    it('should parse string', function () {
      var options = {};
      opbeat.parsers.parseMessage('Howdy', options);
      options.message.should.equal('Howdy');
    });

    it('should parse object', function () {
      var options = {};
      opbeat.parsers.parseMessage({ message: 'foo%s', params: ['bar'] }, options);
      options.message.should.equal('foobar');
      options.param_message.should.equal('foo%s');
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
      parsed.should.have.property('http');
      parsed.http.url.should.equal('https://mattrobenolt.com/some/path?key=value');
    });
  });

  describe('#parseError()', function () {
    it('should parse plain Error object', function (done) {
      opbeat.parsers.parseError(new Error(), {}, function (parsed) {
        parsed.message.should.equal('Error: <no message>');
        parsed.should.have.property('exception');
        parsed.exception.type.should.equal('Error');
        parsed.exception.value.should.equal('');
        parsed.should.have.property('stacktrace');
        parsed.stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse Error with message', function (done) {
      opbeat.parsers.parseError(new Error('Crap'), {}, function (parsed) {
        parsed.message.should.equal('Error: Crap');
        parsed.should.have.property('exception');
        parsed.exception.type.should.equal('Error');
        parsed.exception.value.should.equal('Crap');
        parsed.should.have.property('stacktrace');
        parsed.stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse TypeError with message', function (done) {
      opbeat.parsers.parseError(new TypeError('Crap'), {}, function (parsed) {
        parsed.message.should.equal('TypeError: Crap');
        parsed.should.have.property('exception');
        parsed.exception.type.should.equal('TypeError');
        parsed.exception.value.should.equal('Crap');
        parsed.should.have.property('stacktrace');
        parsed.stacktrace.should.have.property('frames');
        done();
      });
    });

    it('should parse thrown Error', function (done) {
      try {
        throw new Error('Derp');
      } catch(e) {
        opbeat.parsers.parseError(e, {}, function (parsed) {
          parsed.message.should.equal('Error: Derp');
          parsed.should.have.property('exception');
          parsed.exception.type.should.equal('Error');
          parsed.exception.value.should.equal('Derp');
          parsed.should.have.property('stacktrace');
          parsed.stacktrace.should.have.property('frames');
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
          parsed.message.should.equal('TypeError: ' + msg);
          parsed.should.have.property('exception');
          parsed.exception.type.should.equal('TypeError');
          parsed.exception.value.should.equal(msg);
          parsed.should.have.property('stacktrace');
          parsed.stacktrace.should.have.property('frames');
          done();
        });
      }
    });
  });
});
