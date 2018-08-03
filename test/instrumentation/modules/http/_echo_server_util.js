'use strict'

var exec = require('child_process').exec
var path = require('path')

exports.echoServer = echoServer

function echoServer (type, cb) {
  if (typeof type === 'function') return echoServer('http', type)
  var script = path.join(__dirname, '_echo_server.js')
  var cp = exec(`node "${script}" ${type}`)
  cp.stderr.pipe(process.stderr)
  cp.stdout.once('data', function (chunk) {
    var port = chunk.trim().split('\n')[0]
    cb(cp, port)
  })
}
