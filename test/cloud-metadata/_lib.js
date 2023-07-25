/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict';
const express = require('express');
const fixtures = require('./_fixtures');

// how many seconds to wait for a "slow" server
const TIMEOUT_SLOWSERVER_MS = 5000;

/**
 * Add AWS metadata route
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function addAwsRoute(app, fixture) {
  app.get('/latest/dynamic/instance-identity/document', (req, res) => {
    res.send(fixture.response);
  });

  return app;
}

function addSlowAwsRoute(app, fixture) {
  app.get('/latest/dynamic/instance-identity/document', (req, res) => {
    setTimeout(function () {
      res.send(fixture.response);
    }, TIMEOUT_SLOWSERVER_MS);
  });

  return app;
}

/**
 * Add AWS IMDSv2 Route metadata route
 *
 * Rejects requests without an appropriate token.
 *
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
 */
function addAwsIMDSv2Route(app, fixture) {
  app.get('/latest/dynamic/instance-identity/document', (req, res) => {
    const token = req.headers['x-aws-ec2-metadata-token'];
    if (!token) {
      throw new Error('not authorized');
    }
    res.send(fixture.response);
  });

  app.put('/latest/api/token', (req, res) => {
    res.send(fixture.responseToken);
  });

  return app;
}

function addSlowAwsIMDSv2Route(app, fixture) {
  app.get('/latest/dynamic/instance-identity/document', (req, res) => {
    const token = req.headers['x-aws-ec2-metadata-token'];
    if (!token) {
      throw new Error('not authorized');
    }
    setTimeout(function () {
      res.send(fixture.response);
    }, TIMEOUT_SLOWSERVER_MS);
  });

  app.put('/latest/api/token', (req, res) => {
    setTimeout(function () {
      res.send(fixture.responseToken);
    }, TIMEOUT_SLOWSERVER_MS);
  });

  return app;
}

/**
 * Add GCP metadata route
 *
 * Requests require the Metadata-Flavor and the
 * recursive query-string parameter.
 *
 * https://cloud.google.com/compute/docs/storing-retrieving-metadata#querying
 */
function addGcpRoute(app, fixture) {
  app.get('/computeMetadata/v1', (req, res) => {
    if (!req.query.recursive) {
      throw new Error('recursive GET parameter required');
    }

    if (req.header('Metadata-Flavor') !== 'Google') {
      throw new Error('Metadata-Flavor: Google header required');
    }

    res.send(fixture.response);
  });

  return app;
}

function addSlowGcpRoute(app, fixture) {
  app.get('/computeMetadata/v1', (req, res) => {
    if (!req.query.recursive) {
      throw new Error('recursive GET parameter required');
    }

    if (req.header('Metadata-Flavor') !== 'Google') {
      throw new Error('Metadata-Flavor: Google header required');
    }
    setTimeout(function () {
      res.send(fixture.response);
    }, TIMEOUT_SLOWSERVER_MS);
  });

  return app;
}

/**
 * Add Azure metadata route
 *
 * Requests require the api-version query string parameter
 * as well as the Metadata header.
 *
 * https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service
 */
function addAzureRoute(app, fixture) {
  app.get('/metadata/instance', (req, res) => {
    if (!req.query['api-version']) {
      throw new Error('api-version GET parameter required');
    }

    if (req.header('Metadata') !== 'true') {
      throw new Error('Metadata header required');
    }

    res.send(fixture.response);
  });

  return app;
}

function addSlowAzureRoute(app, fixture) {
  app.get('/metadata/instance', (req, res) => {
    if (!req.query['api-version']) {
      throw new Error('api-version GET parameter required');
    }

    if (req.header('Metadata') !== 'true') {
      throw new Error('Metadata header required');
    }
    setTimeout(function () {
      res.send(fixture.response);
    }, TIMEOUT_SLOWSERVER_MS);
  });

  return app;
}

function addSlowRoutesToExpressApp(app, provider, fixture) {
  switch (provider) {
    case 'aws':
      return addSlowAwsRoute(app, fixture);
    case 'aws-IMDSv2':
      return addSlowAwsIMDSv2Route(app, fixture);
    case 'gcp':
      return addSlowGcpRoute(app, fixture);
    case 'azure':
      return addSlowAzureRoute(app, fixture);

    default:
      throw Error(`I don't know how to start a slow ${provider} server`);
  }
}

function addRoutesToExpressApp(app, provider, fixture) {
  switch (provider) {
    case 'aws':
      return addAwsRoute(app, fixture);
    case 'aws-IMDSv2':
      return addAwsIMDSv2Route(app, fixture);
    case 'gcp':
      return addGcpRoute(app, fixture);
    case 'azure':
      return addAzureRoute(app, fixture);
    default:
      throw Error(`I don't know how to start a ${provider} server`);
  }
}

/**
 * Creates an express server that mocks out metadata responses
 *
 * Usage: createTestServer(provider, fixtureName)
 *
 * Returns an express server with a route name that matches
 * the real meta-data provider's route name and will return
 * data as configured in the _fixtures module.
 *
 * @param {string} provider name of cloud meta data provider
 * @param {string} fixtureName name of to response fixtures
 */
function createTestServer(provider, fixtureName) {
  const fixture = loadFixtureData(provider, fixtureName);
  if (!fixture) {
    throw new Error(`Unknown ${provider} fixtured named ${fixtureName}`);
  }
  const app = express();
  return addRoutesToExpressApp(app, provider, fixture);
}

/**
 * Creates a slow Test server
 *
 * Same as createTestServer, but responses will be delayed
 * in order to simulate a timeout.
 *
 * @param {string} provider name of cloud meta data provider
 * @param {string} fixtureName name of to response fixtures
 */
function createSlowTestServer(provider, fixtureName) {
  const fixture = loadFixtureData(provider, fixtureName);
  if (!fixture) {
    throw new Error(`Unknown ${provider} fixtured named ${fixtureName}`);
  }
  const app = express();
  return addSlowRoutesToExpressApp(app, provider, fixture);
}

function loadFixtureData(provider, fixtureName) {
  const providerFixtures = fixtures[provider] ? fixtures[provider] : [];
  const fixture = providerFixtures
    .filter(function (item) {
      return item.name === fixtureName;
    })
    .pop();
  return fixture;
}

module.exports = {
  createTestServer,
  createSlowTestServer,
  loadFixtureData,
};
