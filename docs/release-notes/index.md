---
navigation_title: "Elastic APM Node.js Agent"
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/release-notes.html
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/release-notes-4.x.html
---

# Elastic APM Node.js Agent release notes

Review the changes, fixes, and more in each version of Elastic Node.js Java Agent.

To check for security updates, go to [Security announcements for the Elastic stack](https://discuss.elastic.co/c/announcements/security-announcements/31).

% Release notes includes only features, enhancements, and fixes. Add breaking changes, deprecations, and known issues to the applicable release notes sections.

% ## Next [next]
% **Release date:** Month day, year

% ### Features and enhancements [next-features-enhancements]

% ### Fixes [next-fixes]

## Next [next]

### Features and enhancements [next-features-enhancements]

* Get sourcemap handling for captured exceptions to work with stack frames in
  ES Modules (ESM). Before this, sourcemap handling would only work for stack
  frames in CommonJS modules.

### Fixes [next-fixes]


## 4.11.2 [4-11-2]
**Release date:** March 17, 2025

### Fixes [4-11-2-fixes]

* Fix bug in instrumentation of Azure Functions that could result in crashing the application.  The known case was with a ServiceBus function (using `app.serviceBusTopic(...)` from `@azure/functions`). ([#4508](https://github.com/elastic/apm-agent-nodejs/issues/4508))

## 4.11.1 [4-11-1]
**Release date:** March 14, 2025

### Features and enhancements [4-11-1-features-enhancements]

* Update base image of alpine in `Dockerfile` to version `3.21.3`. ([#4465](https://github.com/elastic/apm-agent-nodejs/pulls/4465))
* Test FIPS 140 compliance. ([#4441](https://github.com/elastic/apm-agent-nodejs/pulls/4441))

### Fixes [4-11-1-fixes]

* Change how `@hapi/hapi` instrumentation includes additional data when
  capturing an error for Hapi `log` and `request` Server events to avoid
  possible capture of large amounts of data, that could lead to latency issues
  and high memory usage. Some data that may have been captured before will
  *no longer* be captured. ([#4503](https://github.com/elastic/apm-agent-nodejs/issues/4503))

  The `@hapi/hapi` instrumentation will capture an APM error whenever a
  Hapi `log` or `request` server event ([https://hapi.dev/api/#server.events](https://hapi.dev/api/#server.events)) with
  the "error" tag is emitted, e.g. when a Hapi server responds with an HTTP 500
  error. Before this change, any and all properties on the logged Error or data
  would be included in the APM error data sent to APM server (in the
  `error.custom` field). This could cause a surprise for applications that attach
  (sometimes large) data to the internal server Error for other purposes (e.g.
  application error handling).

  The expected surprise case is when a deeply-nested object is added as a
  property to the event data.  To protect against serializing these, the Hapi
  instrumentation will only serialize event data properties that are "simple"
  types (boolean, string, number, Date), other types (Array, object, Buffer, etc.)
  will *not* be captured. This is similar behavior as is used for the
  `captureAttributes` option to [`apm.captureError()`](/reference/agent-api.md#apm-capture-error)
  for the same purpose.

  In addition, the updated Hapi instrumentation will no longer capture to
  `error.custom` when the emitted data is an `Error` instance, because this was a
  duplication of the `Error` properties already being captured to the
  `error.exception.attributes` field.

## 4.11.0 [4-11-0]
**Release date:** January 20, 2025

### Features and enhancements [4-11-0-features-enhancements]
* Support instrumentation of Azure Functions using the [v4 Node.js programming model](https://learn.microsoft.com/en-ca/azure/azure-functions/functions-node-upgrade-v4). ([#4426](https://github.com/elastic/apm-agent-nodejs/pull/4426))

### Fixes [4-11-0-fixes]
* Fix instrumentation of `@aws-sdk/client-s3`, `@aws-sdk/client-sqs`, and `@aws-sdk/client-sns` for versions 3.723.0 and later. Internally the AWS SDK clients updated to `@smithy/smithy-client@4`. ([#4398](https://github.com/elastic/apm-agent-nodejs/pull/4398))

## 4.10.0 [4-10-0]
**Release date:** December 24, 2024

### Features and enhancements [4-10-0-features-enhancements]
* Improve trace-level logging to better support debugging central config and transaction sampling issues. ([#4291](https://github.com/elastic/apm-agent-nodejs/issues/4291))

## 4.9.0 [4-9-0]
**Release date:** December 9, 2024

### Features and enhancements [4-9-0-features-enhancements]
* Add support for `undici` v7. ([#4336](https://github.com/elastic/apm-agent-nodejs/pull/4336))

### Fixes [4-9-0-fixes]
* Fix to support a internal refactor in `mysql2` v3.11.5. ([#4334](https://github.com/elastic/apm-agent-nodejs/pull/4334))
* Guard against a possible encoding error of tracing data in the APM client, before it is sent. It is **possible** this could wedge the APM client, resulting in the APM agent no longer sending tracing data. ([#4359](https://github.com/elastic/apm-agent-nodejs/pull/4359))

## 4.8.1 [4-8-1]
**Release date:** November 4, 2024

### Fixes [4-8-1-fixes]
* Fix AWS Lambda instrumentation to work with a "handler" string that includes a period (`.`) in the module path. E.g. the leading `.` in `Handler: ./src/functions/myfunc/handler.main`. ([#4293](https://github.com/elastic/apm-agent-nodejs/issues/4293)).

## 4.8.0 [4-8-0]
**Release date:** October 8, 2024

### Features and enhancements [4-8-0-features-enhancements]
* Minor improvement to container ID parsing from /etc/cgroup v1 files in AWS ECS Fargate, where the pattern has been observed to sometimes differ from the documented pattern. ([APM spec issue #888](https://github.com/elastic/apm/issues/888))
* Add support for `tedious` v19. ([#4218](https://github.com/elastic/apm-agent-nodejs/issues/4218))
* Add support for `koa-router` v13. ([#4236](https://github.com/elastic/apm-agent-nodejs/pull/4236))

### Fixes [4-8-0-fixes]
* Update `cookie` to version `v0.7.2` to fix security issue [CVE-2024-47764](https://github.com/advisories/GHSA-pxg6-pf52-xh8x)

## 4.7.3 [4-7-3]
**Release date:** August 9, 2024

### Fixes [4-7-3-fixes]
* Update import-in-the-middle to 1.11.0, which fixes [an issue](https://github.com/nodejs/import-in-the-middle/issues/144) that can crash users using Nuxt and ESM. ([#4175](https://github.com/elastic/apm-agent-nodejs/pull/4175))

## 4.7.2 [4-7-2]
**Release date:** August 1, 2024

### Features and enhancements [4-7-2-features-enhancements]
* Support hooking built-in Node.js modules loaded via [`process.getBuiltinModule`](https://nodejs.org/api/all.html#all_process_processgetbuiltinmoduleid), added in v22.3.0. ([#4160](https://github.com/elastic/apm-agent-nodejs/pull/4160))

### Fixes [4-7-2-fixes]
* Fix for instrumentation for `@aws-sdk/sns-client` that will prevent a crash if the client is used when there is no parent transaction present. ([#4168](https://github.com/elastic/apm-agent-nodejs/pull/4168))
* Fix for config resolution process. Before this change falsy config options coming from the `elastic-apm-node.js` file were ignored. ([#4119](https://github.com/elastic/apm-agent-nodejs/pull/4119))
* Fix publishing of AWS Lambda layer to all AWS regions. This was broken in the 4.7.1 release. ([#4171](https://github.com/elastic/apm-agent-nodejs/issues/4171))

## 4.7.1 [4-7-1]
**Release date:** July 24, 2024

### Fixes [4-7-1-fixes]
* Update import-in-the-middle internally-used library to v1.9.1. This can fix usage with ESM code (see [*ECMAScript module support*](/reference/esm.md)) in some cases, e.g. usage with [Nuxt 3](https://github.com/elastic/apm-agent-nodejs/issues/4143).

## 4.7.0 [4-7-0]
**Release date:** June 13, 2024

### Features and enhancements [4-7-0-features-enhancements]
* Update [*OpenTelemetry bridge*](/reference/opentelemetry-bridge.md) support to `@opentelemetry/api` version 1.9.0. ([#4078](https://github.com/elastic/apm-agent-nodejs/issues/4078))

    Support for the new `addLink` and `addLinks` methods on Span have been added. However, support for the new synchronous gauge have not yet been added.

## 4.6.0 [4-6-0]
**Release date:** June 5, 2024

### Features and enhancements [4-6-0-features-enhancements]
* Make published `docker.elastic.co/observability/apm-agent-nodejs` Docker images multi-platform, with support for `linux/amd64,linux/arm64` for now. This is necessary for users of the Elastic APM Attacher for Kubernetes, when deploying to k8s nodes that are ARM64 (e.g. Gravitron on AWS). ([#4038](https://github.com/elastic/apm-agent-nodejs/issues/4038))

### Fixes [4-6-0-fixes]
* Fix instrumentation for recent `@aws-sdk/client-*` releases that use `@smithy/smithy-client` v3. (For example `@aws-sdk/client-s3@3.575.0` released 2024-05-13 updated to smithy-client v3.) Before this change the APM agent had been limiting patching of `@smithy/smithy-client` to `>=1 <3`. ([#4036](https://github.com/elastic/apm-agent-nodejs/pull/4036))
* Mark the published AWS Lambda layers as supporting the "nodejs20.x" Lambda Runtime (`--compatible-runtimes`). The "nodejs20.x" runtime was released by AWS on 2023-11-15. ([#4033](https://github.com/elastic/apm-agent-nodejs/issues/4033))

    Note that this Node.js APM agent supports Node.js 20.x, so the new AWS Lambda runtime was supported when it was released. However, the metadata stating compatible runtimes (which is advisory) was not updated until now.

## 4.5.4 [4-5-4]
**Release date:** May 13, 2024

### Fixes [4-5-4-fixes]
* Change how the "cookie" HTTP request header is represented in APM transaction data to avoid a rare, but possible, intake bug where the transaction could be rejected due to a mapping conflict.

    Before this change a `Cookie: foo=bar; sessionid=42` HTTP request header would be represented in the transaction document in Elasticsearch with these document fields (the example assumes [`sanitizeFieldNames`](/reference/configuration.md#sanitize-field-names) matches "sessionid", as it does by default):

    ```
    http.request.headers.cookie: "[REDACTED]"
    ...
    http.request.cookies.foo: "bar"
    http.request.cookies.sessionid: "[REDACTED]"
    ```

    After this change it is represented as:

    ```
    http.request.headers.cookie: "foo=bar; sessionid=REDACTED"
    ```

    In other words, `http.request.cookies` are no longer separated out. ([#4006](https://github.com/elastic/apm-agent-nodejs/issues/4006))


## 4.5.3 [4-5-3]
**Release date:** April 23, 2024

### Fixes [4-5-3-fixes]
* Fix message handling for tombstone messages in `kafkajs` instrumentation. ([#3985](https://github.com/elastic/apm-agent-nodejs/pull/3985))

## 4.5.2 [4-5-2]
**Release date:** April 12, 2024

### Fixes [4-5-2-fixes]
* Fix path resolution for requests that contain invalid characters in its host header. ([#3923](https://github.com/elastic/apm-agent-nodejs/pull/3923))
* Fix span names for `getMore` command of mongodb. ([#3919](https://github.com/elastic/apm-agent-nodejs/pull/3919))
* Fix undici instrumentation to cope with a bug in undici@6.11.0 where `request.addHeader()` was accidentally removed. (It was re-added in undici@6.11.1.) ([#3963](https://github.com/elastic/apm-agent-nodejs/pull/3963))
* Update undici instrumentation to avoid possibly adding a **second** *traceparent* header to outgoing HTTP requests, because this can break Elasticsearch requests. ([#3964](https://github.com/elastic/apm-agent-nodejs/issues/3964))

## 4.5.0 [4-5-0]
**Release date:** March 13, 2024

### Features and enhancements [4-5-0-features-enhancements]
* Update [*OpenTelemetry bridge*](/reference/opentelemetry-bridge.md) support to `@opentelemetry/api` version 1.8.0.
* Update `tedious` instrumentation to support versions 17 and 18. ([#3901](https://github.com/elastic/apm-agent-nodejs/pull/3901), [#3911](https://github.com/elastic/apm-agent-nodejs/pull/3911))
* Add new `kafkajs` instrumentation. ([#2905](https://github.com/elastic/apm-agent-nodejs/issues/2905))

### Fixes [4-5-0-fixes]
* Fix instrumentation of mongodb to not break mongodb@6.4.0. Mongodb v6.4.0 included changes that resulted in the APM agent’s instrumentation breaking it. ([#3897](https://github.com/elastic/apm-agent-nodejs/pull/3897))
* Fix hostname detection on Windows in some cases (where a powershell profile could break collection). ([#3899](https://github.com/elastic/apm-agent-nodejs/pull/3899))
* Fix a path normalization issue that broke (or partially broke) instrumentation of some modules on Windows: Next.js, redis v4+, mongodb. ([#3905](https://github.com/elastic/apm-agent-nodejs/pull/3905))

## 4.4.1 [4-4-1]
**Release date:** February 6, 2024

### Fixes [4-4-1-fixes]
* Add support for [instrumentation of ES module-using (ESM) code](/reference/esm.md) with Node.js versions matching `^18.19.0 || >=20.2.0`. Before this version of the APM agent, ESM instrumentation was only supported for some **earlier** Node.js versions. Changes in Node.js’s ESM loader in v18.19.0 and v20 broke earlier ESM support. ([#3784](https://github.com/elastic/apm-agent-nodejs/issues/3784), [#3844](https://github.com/elastic/apm-agent-nodejs/pull/3844))

## 4.4.0 [4-4-0]
**Release date:** January 12, 2024

### Features and enhancements [4-4-0-features-enhancements]
* Support `ELASTIC_APM_ACTIVATION_METHOD=K8S_ATTACH` (in addition to the current `K8S` value) to indicate the agent is being started by apm-k8s-attacher.  Newer releases of apm-k8s-attacher will be using this value (to have a common value used between APM agents).

### Fixes [4-4-0-fixes]
* Fix bug where `NODE_ENV` environment value was not used as a default for the [`environment`](/reference/configuration.md#environment) config setting. The bug was introduced in v4.2.0. ([#3807](https://github.com/elastic/apm-agent-nodejs/issues/3807))
* Improve Fastify instrumentation to no longer cause the [`FSTDEP017`](https://fastify.dev/docs/latest/Reference/Warnings/#FSTDEP017) and [`FSTDEP018`](https://fastify.dev/docs/latest/Reference/Warnings/#FSTDEP018) deprecation warnings. ([#3814](https://github.com/elastic/apm-agent-nodejs/pull/3814))

## 4.3.0 [4-3-0]
**Release date:** December 5, 2023

### Features and enhancements [4-3-0-features-enhancements]
* Add the [`apmClientHeaders`](/reference/configuration.md#apm-client-headers) config option, to allow adding custom headers to HTTP requests made to APM server by the APM agent. ([#3759](https://github.com/elastic/apm-agent-nodejs/issues/3759))
* Skip undici tests for `undici` `>=5.28.0` and NodeJS `<14.18.0`. ([#3755](https://github.com/elastic/apm-agent-nodejs/pull/3755))
* Change the log level of `Sending error to Elastic APM: ...` from `info` to `debug`. There is no need to clutter the log output with this message. ([#3748](https://github.com/elastic/apm-agent-nodejs/issues/3748))
* Explicitly mark this package as being of type="commonjs". The experimental `node --experimental-default-type=module ...` option [added in Node.js v20.10.0](https://nodejs.org/en/blog/release/v20.10.0#--experimental-default-type-flag-to-flip-module-defaults) means that a default to "commonjs" isn’t guaranteed.

### Fixes [4-3-0-fixes]
* Fix the dependency version range for `@elastic/ecs-pino-format`. ([#3774](https://github.com/elastic/apm-agent-nodejs/issues/3774))

## 4.2.0 [4-2-0]
**Release date:** November 23, 2023

### Features and enhancements [4-2-0-features-enhancements]
* Add [`apm.getServiceVersion()`](/reference/agent-api.md#apm-get-service-version), [`apm.getServiceEnvironment()`](/reference/agent-api.md#apm-get-service-environment), and [`apm.getServiceNodeName()`](/reference/agent-api.md#apm-get-service-node-name). These are intended for use by [ecs-logging-nodejs formatting packages](ecs-logging-nodejs://reference/index.md). See [https://github.com/elastic/ecs-logging-nodejs/pull/152](https://github.com/elastic/ecs-logging-nodejs/pull/152). ([#3195](https://github.com/elastic/apm-agent-nodejs/issues/3195))
* Add knex@3 instrumentation. ([#3659](https://github.com/elastic/apm-agent-nodejs/pull/3659))
* Update [*OpenTelemetry bridge*](/reference/opentelemetry-bridge.md) support to `@opentelemetry/api` version 1.7.0.

### Fixes [4-2-0-fixes]
* Fix `mongodb` instrumentation to avoid loosing context when multiple cursors are running concurrently. ([#3161](https://github.com/elastic/apm-agent-nodejs/issues/3161))
* Set `mongodb` span’s outcome according to the result of the command being traced. ([#3695](https://github.com/elastic/apm-agent-nodejs/pull/3695))
* Fix `@aws-sdk/client-sqs` instrumentation which was failing for `SendMessageBatch` command when any of the entities does not contain `MessageAttributes`. ([#3746](https://github.com/elastic/apm-agent-nodejs/issues/3746))

## 4.1.0 [4-1-0]
**Release date:** October 9, 2023

### Features and enhancements [4-1-0-features-enhancements]
* Update [*OpenTelemetry bridge*](/reference/opentelemetry-bridge.md) support to `@opentelemetry/api` version 1.6.0. [#3622](https://github.com/elastic/apm-agent-nodejs/pull/3622)
* Add support for `@aws-sdk/client-dynamodb`, one of the AWS SDK v3 clients. ([#2958](https://github.com/elastic/apm-agent-nodejs/issues/2958))
* Add support for `@aws-sdk/client-sns`, one of the AWS SDK v3 clients. ([#2956](https://github.com/elastic/apm-agent-nodejs/issues/2956))
* Add support for `@aws-sdk/client-sqs`, one of the AWS SDK v3 clients. ([#2957](https://github.com/elastic/apm-agent-nodejs/issues/2957))
* Fixes for some values of the [`disableInstrumentations`](/reference/configuration.md#disable-instrumentations) config setting. "redis" will now properly disable instrumentation for redis@4. "next" will propertly disable all Next.js instrumentation. ([#3658](https://github.com/elastic/apm-agent-nodejs/pull/3658))

### Fixes [4-1-0-fixes]
* Changes to cloud metadata collection for Google Cloud (GCP). Most notably the `cloud.project.id` field is now the `project-id` from [https://cloud.google.com/compute/docs/metadata/default-metadata-values#project_metadata](https://cloud.google.com/compute/docs/metadata/default-metadata-values#project_metadata) rather than the `numeric-project-id`. This matches the value produced by Elastic Beats (like filebeat). [#3614](https://github.com/elastic/apm-agent-nodejs/issues/3614)

## 4.0.0 [4-0-0]
**Release date:** September 7, 2023

### Features and enhancements [4-0-0-features-enhancements]
* The `apm.destroy()` method is now async. Almost no users should need to use this method. However, if used, to be sure to wait for APM agent shutdown to be complete, one can now `await apm.destroy()`. ([#3222](https://github.com/elastic/apm-agent-nodejs/issues/3222))
* Support instrumenting `mongodb` v6. ([#3596](https://github.com/elastic/apm-agent-nodejs/pull/3596))
* Add a warning message when a duration or size config option is provided without units. ([#2121](https://github.com/elastic/apm-agent-nodejs/issues/2121))
* Change default value of `useElasticTraceparentHeader` config option to `false`. This means that for outgoing HTTP requests, the APM agent will no longer add the `elastic-apm-traceparent` header. This vendor-specific header was used in the past while the [W3C trace-context](https://w3c.github.io/trace-context/) spec was still in development. Now that it is in wide use, the `elastic-apm-traceparent` header is only useful for interaction with very old Elastic APM agents.
* Add default ports into `context.service.target.name` for HTTP spans conforming to the spec update done in [https://github.com/elastic/apm/pull/700](https://github.com/elastic/apm/pull/700) ([#3590](https://github.com/elastic/apm-agent-nodejs/pull/3590))

### Fixes [4-0-0-fixes]
* Fix instrumentation of `mongodb` to avoid multiple command handler registrations when client is created via `MongoClient.connect` static method. ([#3586](https://github.com/elastic/apm-agent-nodejs/pull/3586))




