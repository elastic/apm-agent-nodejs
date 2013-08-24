var opbeat = require('../');
var utils = require('../lib/utils');

describe('utils', function () {
  describe('.validStack()', function () {
    it('should return true if the stack is valid', function () {
      var err = new Error();
      err.stack; // Error.prepareStackTrace is only called when stack is accessed, so access it
      utils.validStack(err.structuredStackTrace).should.equal(true);
    });

    it('should return false if the stack isn\'t valid', function () {
      utils.validStack([]).should.equal(false);
    });
  });
});
