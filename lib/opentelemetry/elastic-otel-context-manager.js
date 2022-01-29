class ElasticOtelContextManager {

  active() {
    throw new Error("implement active")
  }
  with() {
    throw new Error("implement with")
  }

  bind() {
    throw new Error("implement bind")
  }

  enable() {
    return this;
  }

  disable() {
    return this
  }
}

module.exports = ElasticOtelContextManager
