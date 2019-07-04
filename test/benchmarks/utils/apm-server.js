'use strict'

const http = require('http')
const zlib = require('zlib')
const ndjson = require('ndjson')

let start
const metrics = {
  requests: 0,
  bytes: 0,
  events: 0
}

const server = http.createServer(function (req, res) {
  metrics.requests++

  const stream = req.pipe(zlib.createGunzip())

  stream.on('data', chunk => { metrics.bytes += chunk.length })

  switch (req.url) {
    case '/v1/transactions':
      const buffers = []
      stream
        .on('data', buffers.push.bind(buffers))
        .on('end', function () {
          res.end()
          const data = JSON.parse(Buffer.concat(buffers).toString())
          for (const trans of data.transactions) {
            if (!start && trans.name === 'warmup') return
            metrics.events += 1 + trans.spans.length
          }
        })
      break
    case '/intake/v2/events':
      stream
        .pipe(ndjson.parse())
        .on('data', (obj) => {
          if ('metadata' in obj) return
          if (!start) {
            // w === warmup
            if ('transaction' in obj && obj.transaction.name[0] === 'w') return
            if ('span' in obj && obj.span.name[0] === 'w') return
          }
          metrics.events++
        })
        .on('end', function () {
          res.end()
        })
      break
  }
})

server.listen(8200)

// benchmark app usees sigint to signal when warmup is done and when the test
// should end
process.on('SIGUSR2', function () {
  if (start) endBenchmark()
  else startBenchmark()
})

function startBenchmark () {
  start = process.hrtime()
  metrics.requests = 0
  metrics.bytes = 0
  metrics.events = 0
}

function endBenchmark () {
  const duration = process.hrtime(start)
  process.stdout.write(JSON.stringify({ duration, metrics }))
}
