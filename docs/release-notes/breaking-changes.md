---
navigation_title: "Breaking changes"
---

# Elastic APM Node.js Agent breaking changes
Before you upgrade, carefully review the Elastic APM Node.js Agent breaking changes and take the necessary steps to mitigate any issues.

To learn how to upgrade, check out [Upgrading](/reference/upgrading.md).

% ## Next version [next-version]
% **Release date:** Month day, year

% ::::{dropdown} Title of breaking change
% Description of the breaking change.
% For more information, check [PR #](PR link).
% **Impact**<br> Impact of the breaking change.
% **Action**<br> Steps for mitigating deprecation impact.
% ::::

## 4.2.0 [4-2-0]
**Release date:** November 23, 2023

* Drop support for next@11. Next.js instrumentation support is currently in technical preview, so it is not considered a semver-major change to drop support for this old version of next. For more information, check ([#3664](https://github.com/elastic/apm-agent-nodejs/pull/3664)).

## 4.0.0 [4-0-0]
* Set the new minimum supported Node.js to version 14.17.0. Users of earlier Node.js versions can use elastic-apm-node v3.x, which supports back to Node.js v8.6.
* Ignore a `timer` option passed to `startTransaction()` and `startSpan()` APIs. This option was never documented. It would be surprising if any user is impacted by this.
* Remove long deprecated support for the `ELASTIC_APM_`-prefixed environment variables for the [Kubernetes config options](/reference/configuration.md#kubernetes-node-name). For example, one must use `KUBERNETES_POD_NAME` and not `ELASTIC_APM_KUBERNETES_POD_NAME`. ([#2661](https://github.com/elastic/apm-agent-nodejs/issues/2661))
* The config option `filterHttpHeaders` is now *removed*. ([#3539](https://github.com/elastic/apm-agent-nodejs/pull/3539))
* Remove the deprecated `span.toString()` and `transaction.toString()` APIs. ([#2348](https://github.com/elastic/apm-agent-nodejs/issues/2348))
* Remove instrumentation support for the old *hapi* package — the current *@hapi/hapi* package is still instrumented. ([#2691](https://github.com/elastic/apm-agent-nodejs/issues/2691))
* Change `apm.startTransaction()` api to return a noop transaction instead of null, if the agent is not yet started. ([#2429](https://github.com/elastic/apm-agent-nodejs/issues/2429))
* Drop support for the obsolete "patch" context manager, i.e. the `contextManager: "patch"` config option. This was a limited async context management that predated the preferred `AsyncLocalStorage` core Node.js mechanism for context tracking. It was deprecated in v3.37.0.  As well, the related and deprecated `asyncHooks` config option has been removed. ([#3529](https://github.com/elastic/apm-agent-nodejs/issues/3529))
* Remove the `logUncaughtExceptions` config option. ([#2412](https://github.com/elastic/apm-agent-nodejs/issues/2412))
* Remove `transaction.subtype` and `transaction.action` properties from API. This also impacts [`apm.startTransaction([name][, type][, options])`](/reference/agent-api.md#apm-start-transaction) and `transaction.setType(...)`, both of which now no longer accept `subtype` and `action` parameters. These two properties were deprecated in v3.25.0. ([#3557](https://github.com/elastic/apm-agent-nodejs/issues/3557))
* Remove support for the erroneous `ELASTIC_SANITIZE_FIELD_NAMES` and `ELASTIC_IGNORE_MESSAGE_QUEUES` config environment variables. The correct env vars are `ELASTIC_APM_SANITIZE_FIELD_NAMES` and `ELASTIC_APM_IGNORE_MESSAGE_QUEUES`, respectively, and were supported starting in v3.36.0.