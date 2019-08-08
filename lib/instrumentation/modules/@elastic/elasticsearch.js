'use strict'

const { setDbContext } = require('../../elasticsearch-shared')

module.exports = function (elasticsearch, agent, { version, enabled }) {
  if (!enabled) return elasticsearch

  function generateSpan (activeSpans, meta, params) {
    const span = agent.startSpan(null, 'db.elasticsearch.request')
    if (span === null) return null

    const { request } = meta
    span.name = `Elasticsearch: ${params.method} ${params.path}`

    setDbContext(span, params)

    activeSpans.set(request.id, span)

    return span
  }

  class ApmClient extends elasticsearch.Client {
    constructor (opts) {
      super(opts)

      const activeSpans = new Map()
      let hasPrepareRequestEvent = false

      this.on('prepare-request', (err, { meta, params }) => {
        hasPrepareRequestEvent = true
        if (err) {
          return agent.captureError(err)
        }

        generateSpan(activeSpans, meta, params)
      })

      this.on('request', (err, { meta }) => {
        const { request } = meta
        let span = null
        if (err) {
          span = activeSpans.get(request.id)
          agent.captureError(err)
          if (span !== undefined) {
            span.end()
            activeSpans.delete(request.id)
          }
          return
        }

        if (hasPrepareRequestEvent === false) {
          span = generateSpan(activeSpans, meta, meta.request.params)
          // if (span === null) return
        }

        // TODO: can we signal somehow that here
        //       we are starting the actual http request?
      })

      this.on('response', (err, { meta }) => {
        if (err) {
          // TODO: rebuild error object to avoid serialization issues
          agent.captureError(err, { custom: err.message })
          // agent.captureError(err, { labels: { meta: JSON.stringify(err.meta) } })
          // agent.captureError(err, { custom: JSON.parse(JSON.stringify(err.meta)) })
          // agent.captureError(err, { custom: err.meta.meta.connection })
        }

        const { request } = meta
        const span = activeSpans.get(request.id)
        if (span !== undefined) {
          span.end()
          activeSpans.delete(request.id)
        }
      })
    }
  }

  return Object.assign(elasticsearch, { Client: ApmClient })
}
