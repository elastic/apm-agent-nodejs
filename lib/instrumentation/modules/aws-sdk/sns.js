function instrumentationSns (orig, origArguments, request, AWS, agent, { version, enabled }) {
  return orig.apply(request, origArguments)
}

module.exports = {
  instrumentationSns
}
