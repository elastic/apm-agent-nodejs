'use strict'

process.on('SIGUSR2', function () {
  process.exit()
})

const http = require('http')

const server = http.createServer(function (req, res) {
  req.on('end', function () {
    res.end()
  })
  req.resume()
})

server.listen(8200)
