---
navigation_title: "Elastic APM Node.Js Agent"

---

# Elastic APM Node.Js Agent known issues [elastic-apm-nodejs-agent-known-issues]

% Use the following template to add entries to this page.

% :::{dropdown} Title of known issue
% **Details**
% On [Month/Day/Year], a known issue was discovered that [description of known issue].

% **Workaround**
% Workaround description.

% **Resolved**
% On [Month/Day/Year], this issue was resolved.

:::

## 4.4.0 [elastic-apm-nodejs-agent-440-release-notes]
**Release date:** January 12, 2024
## 4.4.0 - 2024/01/12 [release-notes-4.4.0]
**Known issue**: Using the APM agent’s [*ECMAScript module support*](The current ESM support is limited — only a subset of the modules listed at [*Supported technologies*](/reference/esm.md) with Node.js **v18.19.0** is not supported in this version. Upgrade to APM agent version v4.5.0 or later, or use Node.js v18.18.1 or earlier. See [https://github.com/elastic/apm-agent-nodejs/issues/3784](https://github.com/elastic/apm-agent-nodejs/issues/3784) for details.

## 4.3.0 [elastic-apm-nodejs-agent-430-release-notes]
**Release date:** December 5, 2023
**Known issue**: Using the APM agent’s [*ECMAScript module support*](/reference/esm.md) with Node.js **v18.19.0** is not supported in this version. Upgrade to APM agent version v4.5.0 or later, or use Node.js v18.18.1 or earlier. See [https://github.com/elastic/apm-agent-nodejs/issues/3784](https://github.com/elastic/apm-agent-nodejs/issues/3784) for details.