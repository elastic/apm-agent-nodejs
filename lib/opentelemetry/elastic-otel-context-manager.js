class ElasticOtelContextManager {
  constructor (agent) {
    this.agent = agent
  }

  active () {
    return this.agent._instrumentation._runCtxMgr.active()
  }

  with () {
    throw new Error('with not implemented in ElasticOtelContextManager')
  }

  bind () {
    throw new Error('bind not implemented in ElasticOtelContextManager')
  }

  enable () {
    return this
  }

  disable () {
    return this
  }
}

module.exports = ElasticOtelContextManager
