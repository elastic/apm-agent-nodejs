// An app that uses a Prometheus client to export metrics for scraping.
//    http://localhost:3003/metrics
// No OTel or Elastic APM usage user. This is a baseline for comparison.

'use strict'

const PORT = 3003
const SERVICE_NAME = 'examples-opentelemetry-metrics-C'

const prom = require('prom-client') // https://github.com/siimon/prom-client
const Fastify = require('fastify')


function indent(s) {
  const indentation = '    '
  return indentation + s.split(/\r?\n/g).join('\n' + indentation) + '\n'
}


// ---- mainline

// XXX what labels?
prom.register.setDefaultLabels({
  'serviceName': SERVICE_NAME
})
// prom.collectDefaultMetrics(); // XXX

const counter = new prom.Counter({
  name: 'test_counter',
  help: 'A test Counter',
});

setInterval(() => {
  counter.inc(1)
}, 1000)

const fastify = Fastify({
  logger: true
})
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})
fastify.get('/metrics', async function (request, reply) {
  reply.send(await prom.register.metrics())
  console.log('Scraped')
})
fastify.listen({ port: PORT }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  console.log(`Listening at ${address}`)
})

// // Manual "scrape" of metrics.
// const METRICS_INTERVAL_MS = 5000
// setInterval(async () => {
//   const metrics = await prom.register.metrics()
//   console.log('\n# metrics at %s\n\n%s', new Date().toISOString(), indent(metrics))
// }, METRICS_INTERVAL_MS)

process.on('SIGTERM', () => {
  console.log('Bye (SIGTERM).')
  process.exit()
})
