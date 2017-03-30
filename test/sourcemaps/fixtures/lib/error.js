'use strict';

// Just a little prefixing line
var generateError = function generateError() {
  var msg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'foo';
  return new Error(msg);
};

module.exports = generateError;

//# sourceMappingURL=error.js.map