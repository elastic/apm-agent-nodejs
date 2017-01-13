'use strict'

var path = require('path')
var fs = require('fs')
var opbeat = require('./')

var filepath = path.resolve('opbeat.js')

if (fs.existsSync(filepath)) opbeat.start(require(filepath))
else opbeat.start()
