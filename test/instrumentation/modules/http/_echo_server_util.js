'use strict'

var path = require('path')
var exec = require('child_process').exec

exports.echoServer = echoServer

function echoServer (type, cb) {
  if (typeof type === 'function') return echoServer('http', type)
  var cp = exec('node ' + path.join(__dirname, '/_echo_server.js ' + type))
  cp.stderr.pipe(process.stderr)
  cp.stdout.once('data', function (chunk) {
    var port = chunk.trim().split('\n')[0]
    cb(cp, port)
  })
}
