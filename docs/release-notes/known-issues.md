---
navigation_title: "Known issues"
---

# Elastic APM Node.js agent known issues [elastic-apm-nodejs-agent-known-issues]
Known issues are significant defects or limitations that may impact your implementation. These issues are actively being worked on and will be addressed in a future release. Review the Elastic APM Node.js agent known issues to help you make informed decisions, such as upgrading to a new version.

% Use the following template to add entries to this page.

% :::{dropdown} Title of known issue
% **Applicable versions for the known issue and the version for when the known issue was fixed**
% On [Month Day, Year], a known issue was discovered that [description of known issue].
% For more information, check [Issue #](Issue link).

% **Workaround**<br> 
% Workaround description.
:::

:::{dropdown} Using ECMAScript module support with Node.js **v18.19.0** is unsupported 
**Applicable versions: 4.3.0 and 4.4.0**
Using APM agent [*ECMAScript module support*](/reference/esm.md) with Node.js **v18.19.0** is unsupported.
For more information, check [#3784](https://github.com/elastic/apm-agent-nodejs/issues/3784).

**Workaround**<br> 
Upgrade to APM agent 4.5.0 or later or use Node.js 18.18.1 or earlier.
:::