'use strict';

var stackback = require('stackback');
var opbeat = require('../');
var utils = require('../lib/utils');

describe('utils', function () {
  describe('.validStack()', function () {
    it('should return true if the stack is valid', function () {
      var err = new Error();
      var stack = stackback(err);
      utils.validStack(stack).should.equal(true);
    });

    it('should return false if the stack isn\'t valid', function () {
      utils.validStack([]).should.equal(false);
    });
  });

  describe('.parseStack()', function () {
    it('should call the callback with an array of stack frames', function (done) {
      var err = new Error();
      var stack = stackback(err);
      utils.parseStack(stack, function (frames) {
        frames.should.be.an.instanceOf(Array);
        frames.length.should.not.equal(0);
        frames[0].should.have.ownProperty('filename');
        frames[0].should.have.ownProperty('function');
        frames[0].should.have.ownProperty('lineno');
        frames[0].should.have.ownProperty('in_app');
        done();
      });
    });
  });
});
