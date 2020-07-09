'use strict'

var shimmer = require('../shimmer')
var { getDBDestination } = require('../context')

var URL = require('url-parse')

module.exports = function (amqplib, agent, { version, enabled }) {
  agent.logger.debug('shimming amqplib.connect')
  shimmer.wrap(amqplib, 'connect', wrapConnect)

  return amqplib

  function patchChannelModel (channelModel, host, port) {
    agent.logger.debug('shimming amqplib.ChannelModel.connection.sendMessage')
    shimmer.wrap(channelModel.connection, 'sendMessage', function (orig) {
      return function (channel, method, fields, properties, props, content) {
        var span = enabled && agent.startSpan(null, 'messaging', 'amqp', 'publish')
        var id = span && span.transaction.id

        agent.logger.debug('intercepted call to amqplib.Connection.sendMessage %o', { id: id, channel: channel, content: content })

        if (span) {
          span.setDestinationContext(getDBDestination(span, host, port))
        }

        var res = orig.apply(this, arguments)
        span.end()
        return res
      }
    })
  }

  function wrapConnect (original) {
    return function wrappedConnect (url) {
      let protocol, host, port
      if (typeof url === 'object') {
        protocol = (url.protocol || 'amqp') + ':'
        host = url.hostname
        port = url.port || ((protocol === 'amqp:') ? 5672 : 5671)
      } else {
        var parts = URL(url, true)
        protocol = parts.protocol
        host = parts.hostname
        port = parseInt(parts.port) || ((protocol === 'amqp:') ? 5672 : 5671)
      }

      return original.apply(this, arguments).then(function (channelModel) {
        patchChannelModel(channelModel, host, port)
        return channelModel
      })
    }
  }
}
