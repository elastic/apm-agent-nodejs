'use strict'

var path = require('path')
var fs = require('fs')
var opbeat = require('./')

var filepath = path.resolve(process.env.OPBEAT_CONFIG_FILE || 'opbeat.js')

if (fs.existsSync(filepath)) opbeat.start(require(filepath))
else opbeat.start()

module.exports = opbeat
