'use strict';

module.exports = function connectMiddleware () {
  var client = this;
  return function (err, req, res, next) {
    client.captureError(err, { request: req }, function () {
      next(err);
    });
  };
};
