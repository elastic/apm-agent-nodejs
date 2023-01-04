/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Some utilities for instrumentation of Azure Functions.  Most of the Azure
// Functions handling is in "lib/instrumentation/modules/azure-functions-nodejs-worker".

const isAzureFunctionsEnvironment = !!process.env.FUNCTIONS_WORKER_RUNTIME

// The Azure account id is also called the "subscription GUID".
// https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings#app-environment
function getAzureAccountId () {
  return process.env.WEBSITE_OWNER_NAME && process.env.WEBSITE_OWNER_NAME.split('+', 1)[0]
}

// Gather APM metadata for this Azure Function instance per
// https://github.com/elastic/apm/blob/main/specs/agents/tracing-instrumentation-azure-functions.md#metadata
function getAzureFunctionsExtraMetadata () {
  const metadata = {
    service: {
      framework: {
        // Passing this service.framework.name to Client#setExtraMetadata()
        // ensures that it "wins" over a framework name from
        // `agent.setFramework()`, because in the client `_extraMetadata`
        // wins over `_conf.metadata`.
        name: 'Azure Functions',
        version: process.env.FUNCTIONS_EXTENSION_VERSION
      },
      runtime: {
        name: process.env.FUNCTIONS_WORKER_RUNTIME
      },
      // XXX discuss on spec
      node: {
        configured_name: process.env.WEBSITE_INSTANCE_ID
      }
    },
    // XXX discuss on spec
    cloud: {
      provider: 'azure',
      region: process.env.REGION_NAME,
      service: {
        name: 'functions'
      }
    }
  }
  // XXX discuss on spec
  const accountId = getAzureAccountId()
  if (accountId) {
    metadata.cloud.account = { id: accountId }
  }
  return metadata
}

module.exports = {
  isAzureFunctionsEnvironment,
  getAzureAccountId,
  getAzureFunctionsExtraMetadata
}
