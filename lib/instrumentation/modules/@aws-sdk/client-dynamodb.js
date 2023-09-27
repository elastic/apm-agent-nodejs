/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';

const constants = require('../../../constants');
const NAME = 'DynamoDB';
const TYPE = 'db';
const SUBTYPE = 'dynamodb';
const elasticAPMStash = Symbol('elasticAPMStash');

/**
 * Returns middlewares to instrument an S3Client instance
 *
 * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
 * @param {any} agent
 * @returns {import('../@smithy/smithy-client').AWSMiddlewareEntry[]}
 */
function dynamoDBMiddlewareFactory(client, agent) {
  return [
    {
      middleware: (next, context) => async (args) => {
        // Ensure there is a span from the wrapped `client.send()`.
        const span = agent._instrumentation.currSpan();
        if (!span || !(span.type === TYPE && span.subtype === SUBTYPE)) {
          return await next(args);
        }

        const input = args.input;
        const table = input && input.TableName;
        // The given span comes with the operation name and we need to
        // add the table if applies
        if (table) {
          span.name += ' ' + table;
        }

        let err;
        let result;
        let response;
        let statusCode;
        try {
          result = await next(args);
          response = result && result.response;
          statusCode = response && response.statusCode;
        } catch (ex) {
          // Save the error for use in `finally` below, but re-throw it to
          // not impact code flow.
          err = ex;

          // This code path happens with a GetObject conditional request
          // that returns a 304 Not Modified.
          statusCode = err && err.$metadata && err.$metadata.httpStatusCode;
          throw ex;
        } finally {
          if (statusCode) {
            span._setOutcomeFromHttpStatusCode(statusCode);
          } else {
            span._setOutcomeFromErrorCapture(constants.OUTCOME_FAILURE);
          }
          if (err && (!statusCode || statusCode >= 400)) {
            agent.captureError(err, { skipOutcome: true });
          }

          const config = client.config;
          const region = await config.region();

          // Set the db context
          const dbContext = { type: SUBTYPE }; // dynamodb
          if (region) {
            dbContext.instance = region;
          }
          if (input && input.KeyConditionExpression) {
            dbContext.statement = input.KeyConditionExpression;
          }
          span.setDbContext(dbContext);

          // Set destination context
          const destContext = {};
          if (context[elasticAPMStash]) {
            destContext.address = context[elasticAPMStash].hostname;
            destContext.port = context[elasticAPMStash].port;
          }
          if (region) {
            destContext.service = { resource: `dynamodb/${region}` };
            destContext.cloud = { region };
          }
          span._setDestinationContext(destContext);

          // TODO: add OTel attributes when spec is merged
          // https://github.com/elastic/apm/pull/817

          span.end();
        }

        return result;
      },
      options: { step: 'initialize', priority: 'high', name: 'elasticAPMSpan' },
    },
    {
      middleware: (next, context) => async (args) => {
        const req = args.request;
        let port = req.port;

        // Resolve port for HTTP(S) protocols
        if (port === undefined) {
          if (req.protocol === 'https:') {
            port = 443;
          } else if (req.protocol === 'http:') {
            port = 80;
          }
        }

        context[elasticAPMStash] = {
          hostname: req.hostname,
          port,
        };
        return next(args);
      },
      options: { step: 'finalizeRequest', name: 'elasticAPMHTTPInfo' },
    },
  ];
}

/**
 * Tells if the command needs to be ingored
 * @param {import('@aws-sdk/types').Command} command the command sent by the SNS client
 * @param {any} config the agent configuration
 * @returns {boolean} false if the command should create a span
 */
function dynamoDBShouldIgnoreCommand(command, config) {
  return false;
}

module.exports = {
  DYNAMODB_NAME: NAME,
  DYNAMODB_TYPE: TYPE,
  DYNAMODB_SUBTYPE: SUBTYPE,
  dynamoDBMiddlewareFactory,
  dynamoDBShouldIgnoreCommand,
};
