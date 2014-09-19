'use strict';

var log = module.exports = {};

var clientLevel;
var logLevels = ['debug', 'info', 'warn', 'error', 'fatal'];

var shouldLog = function (level) {
  return logLevels.indexOf(level) >= logLevels.indexOf(clientLevel);
};

log.setLevel = function (level) {
  clientLevel = level;
};

logLevels.forEach(function (level) {
  log[level] = function () {
    if (!shouldLog(level)) return;
    switch (level) {
      case 'debug': level = 'info'; break;
      case 'fatal': level = 'error'; break;
    }
    console[level].apply(console, arguments);
  };
});
