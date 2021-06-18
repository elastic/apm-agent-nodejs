'use strict'

// Instrument the @aws-sdk/client-s3 package.
// https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3
//
// XXX doc technique used

const constants = require('../../../constants')

const TYPE = 'storage'
const SUBTYPE = 's3'

// For a HeadObject API call, `context.commandName === 'HeadObjectCommand'`.
const COMMAND_NAME_RE = /^(\w+)Command$/
function opNameFromCommandName (commandName) {
  const match = COMMAND_NAME_RE.exec(commandName)
  if (match) {
    return match[1]
  } else {
    return '<unknown command>'
  }
}

// This regex adapted from "OutpostArn" pattern at
// https://docs.aws.amazon.com/outposts/latest/APIReference/API_Outpost.html
const ARN_REGEX = /^arn:aws([a-z-]+)?:(s3|s3-outposts):[a-z\d-]+:\d{12}:(.*?)$/

function resourceFromParams (params) {
  let resource = null // The bucket name or normalized Access Point/Outpost ARN.
  if (params && params.Bucket) {
    resource = params.Bucket
    if (resource.startsWith('arn:')) {
      // This is an Access Point or Outpost ARN, e.g.:
      // - arn:aws:s3:region:account-id:accesspoint/resource
      // - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/bucket/<bucket-name>
      // - arn:aws:s3-outposts:<region>:<account>:outpost/<outpost-id>/accesspoint/<accesspoint-name></accesspoint-name>
      const match = ARN_REGEX.exec(resource)
      if (match) {
        resource = match[3]
      }
    }
  }
  return resource
}

module.exports = function instrumentAwsSdkClientS3 (mod, agent, { version, enabled }) {
  if (!enabled) {
    return mod
  }
  if (!mod.S3Client) {
    agent.logger.debug('@aws-sdk/client-s3@%s is not supported (no `S3Client`) - aborting...', version)
    return mod
  }

  class ApmS3Client extends mod.S3Client {
    constructor (...args) {
      super(...args)

      const client = this

      // Add a middleware at (or near) the "top", that starts and ends a span.
      this.middlewareStack.add(
        (next, context) => async (args) => {
          const opName = opNameFromCommandName(context.commandName)
          const resource = resourceFromParams(args.input)
          const name = resource ? `S3 ${opName} ${resource}` : `S3 ${opName}`
          const span = agent.startSpan(name, TYPE, SUBTYPE, opName)

          let err
          let result
          try {
            result = await next(args)
          } catch (ex) {
            // Save the error for use in `finally` below, but re-throw it to
            // not impact code flow.
            err = ex
            throw ex
          } finally {
            if (span) {
              let statusCode
              if (result && result.response) {
                statusCode = result.response.statusCode
              } else if (err && err.$metadata && err.$metadata.httpStatusCode) {
                // This code path happens with a conditional GetObject request
                // that returns a 304 Not Modified.
                statusCode = err.$metadata.httpStatusCode
              }
              if (statusCode) {
                span._setOutcomeFromHttpStatusCode(statusCode)
              } else {
                span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE)
              }
              if (err && (!statusCode || statusCode >= 400)) {
                agent.captureError(err, { skipOutcome: true })
              }

              // Destination context.
              let port = context._port
              if (port === undefined) {
                if (context._protocol === 'https:') {
                  port = 443
                } else if (context._protocol === 'http:') {
                  port = 80
                }
              }
              const destContext = {
                address: context._hostname,
                port: port,
                service: {
                  name: SUBTYPE,
                  type: TYPE
                }
              }
              if (resource) {
                destContext.service.resource = resource
              }
              // XXX if client.conf.useArnRegion, then get from Arn if it is, else fallback to client.conf.region?
              //    XXX to try: client using us-east-2, ARN to us-west-1, does it work?
              const region = await client.config.region()
              if (region) {
                destContext.cloud = { region }
              }
              span.setDestinationContext(destContext)

              span.end()
            }
          }
          console.warn('XXX returning result')
          return result
        },
        {
          step: 'initialize',
          priority: 'high',
          name: 'elasticAPMMiddleware'
        }
      )

      this.middlewareStack.add(
        (next, context) => async (args) => {
          // Stash info needed for destination context.
          context._hostname = args.request.hostname
          context._port = args.request.port
          context._protocol = args.request.protocol
          return await next(args)
        },
        {
          step: 'finalizeRequest'
        }
      )
    }
  }

  agent.logger.debug('shimming <@aws-sdk/client-s3>.S3Client')

  // How do I wrap thee? Let me count the ways.
  //
  // Ideally we would like to return the loaded `@aws-sdk/client-s3` module,
  // `mod`, with the only change being to the `mod.S3Client` constructor; or to
  // just replace it with our `ApmS3Client` subclass. However, there are
  // roadblocks and options:
  //
  // 1. The technique used in `@elastic/elasticsearch` instrumentation:
  //      return Object.assign(mod, { S3Client: ApmS3Client })
  //    hits:
  //      TypeError: Cannot set property S3Client of #<Object> which has only a getter
  //    because the TypeScript-built CommonJS package sets all the exported
  //    properties to getters for lazy loading.
  //
  // 2. We cannot just replace the getter with our own:
  //      Object.defineProperty(mod, 'S3Client', { enumerable: true, get: function () { return ApmS3Client } })
  //      return mod
  //    Because the @aws-sdk/client-s3/dist/cjs/index.js sets 'S3Client' to a
  //    property with `configurable: false`.
  //      TypeError: Cannot redefine property: S3Client
  //
  // 3. We cannot:
  //      shimmer.wrap(mod, 'S3Client', ApmS3Client)
  //    for the same reason as #2.
  //
  // 4. We *can* workaround by shimming the `.send` method:
  //      shimmer.wrap(AWS.Request.prototype, 'send', function (orig) { ... })
  //    but that is not ideal because we then will be attempting to add our
  //    middleware for every API call rather than just at client creation.
  //    Still, it would work.
  //
  // shimmer.wrap(mod.S3Client.prototype, 'send', function (orig) {
  //   return function _wrappedS3ClientSend () {
  //     // ...
  //     return orig.apply(this, arguments)
  //   }
  // })
  // return mod
  //
  // 5. Finally, we *can* return a totally new object for the module that uses
  //    a getter for every property that returns the origin `mod`'s property,
  //    except `S3Client` for which we use our subclass. Currently `mod` has
  //    no `Object.getOwnPropertySymbols(mod)`. I'm a little uncertain how to
  //    treat symbols here if there were any. Is this a little heavy-handed?
  const wrappedMod = {}
  const names = Object.getOwnPropertyNames(mod)
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (name === 'S3Client') {
      wrappedMod[name] = ApmS3Client
    } else {
      Object.defineProperty(wrappedMod, name, { enumerable: true, get: function () { return mod[name] } })
    }
  }
  return wrappedMod
}
