---
navigation_title: "Breaking changes"
---

# {{apm-node-agent}} breaking changes [elastic-apm-nodejs-agent-breaking-changes]
Breaking changes can impact your Elastic applications, potentially disrupting normal operations. Before you upgrade, carefully review the {{apm-node-agent}} breaking changes and take the necessary steps to mitigate any issues. To learn how to upgrade, check out [Upgrading](/reference/upgrading.md).

% ## Next version [elastic-apm-nodejs-agent-nextversion-breaking-changes]
% **Release date:** Month day, year

% ::::{dropdown} Title of breaking change
% Description of the breaking change.
% For more information, check [PR #](PR link).
% **Impact**<br> Impact of the breaking change.
% **Action**<br> Steps for mitigating deprecation impact.
% ::::

## 4.2.0 [elastic-apm-nodejs-agent-420-breaking-changes]
**Release date:** November 23, 2023

::::{dropdown} Removes support for next@11
Next.js instrumentation support is currently in technical preview, so it is not considered a semver-major change to drop support for this old version of next.

For more information, check [#3664](https://github.com/elastic/apm-agent-nodejs/pull/3664).
::::

## 4.0.0 [elastic-apm-nodejs-agent-400-breaking-changes]

::::{dropdown} Changes minimum supported Node.js version
Sets the new minimum supported Node.js to version 14.17.0.

**Action**<br> 
Users of earlier Node.js versions can use elastic-apm-node v3.x, which supports back to Node.js v8.6.
::::

::::{dropdown} Ignore `timer` option
Ignore a `timer` option passed to `startTransaction()` and `startSpan()` APIs.

**Impact**<br> 
This option was never documented. It would be surprising if any user is impacted by this.
::::

::::{dropdown} Removes long deprecated support for the `ELASTIC_APM_`-prefixed environment variables
Removes long deprecated support for the `ELASTIC_APM_`-prefixed environment variables for the [Kubernetes config options](/reference/configuration.md#kubernetes-node-name).

For more information, check [#2661](https://github.com/elastic/apm-agent-nodejs/issues/2661).

**Impact**<br> 
For example, one must use `KUBERNETES_POD_NAME` and not `ELASTIC_APM_KUBERNETES_POD_NAME`.
::::

::::{dropdown} Removes `filterHttpHeaders` config option
The config option `filterHttpHeaders` is now *removed*.

For more information, check [#3539](https://github.com/elastic/apm-agent-nodejs/pull/3539).
::::

::::{dropdown} Removes deprecated APIs
Removes the deprecated `span.toString()` and `transaction.toString()` APIs.

For more information, check [#2348](https://github.com/elastic/apm-agent-nodejs/issues/2348).
::::

::::{dropdown} Removes *hapi* package instrumentation support
Removed instrumentation support for the old *hapi* package — the current *@hapi/hapi* package is still instrumented.

For more information, check [#2691](https://github.com/elastic/apm-agent-nodejs/issues/2691).
::::

::::{dropdown} Changes `apm.startTransaction()` API
Changed `apm.startTransaction()` API to return a noop transaction instead of null, if the agent is not yet started.

For more information, check [#2429](https://github.com/elastic/apm-agent-nodejs/issues/2429).
::::

::::{dropdown} Removes support for the obsolete "patch" context manager
Removed support for the obsolete "patch" context manager, i.e. the `contextManager: "patch"` config option. This was a limited async context management that predated the preferred `AsyncLocalStorage` core Node.js mechanism for context tracking. It was deprecated in v3.37.0.  As well, the related and deprecated `asyncHooks` config option has been removed.

For more information, check [#3529](https://github.com/elastic/apm-agent-nodejs/issues/3529).
::::

::::{dropdown} Removes `logUncaughtExceptions`
Removed the `logUncaughtExceptions` config option.

For more information, check [#2412](https://github.com/elastic/apm-agent-nodejs/issues/2412).
::::

::::{dropdown} Removes `transaction.subtype` and `transaction.action` properties
Removed the `transaction.subtype` and `transaction.action` properties from the API. This also impacts [`apm.startTransaction([name][, type][, options])`](/reference/agent-api.md#apm-start-transaction) and `transaction.setType(...)`, both of which now no longer accept `subtype` and `action` parameters. These two properties were deprecated in v3.25.0.

For more information, check [#3557](https://github.com/elastic/apm-agent-nodejs/issues/3557).
::::

::::{dropdown} Removes support for config environment variables
Removed support for the erroneous `ELASTIC_SANITIZE_FIELD_NAMES` and `ELASTIC_IGNORE_MESSAGE_QUEUES` config environment variables. 

**Action**<br> The correct env vars are `ELASTIC_APM_SANITIZE_FIELD_NAMES` and `ELASTIC_APM_IGNORE_MESSAGE_QUEUES`, respectively, and were supported starting in v3.36.0.
::::