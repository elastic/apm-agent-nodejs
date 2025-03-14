---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/api.html
---

# API Reference [api]

The API reference documentation is divided into three parts:

* [The `Agent` API](/reference/agent-api.md) - All functions and properties on the `Agent` object. An instance of the `Agent` object is acquired by requiring/importing the Node.js APM Agent module. The `Agent` is a singleton and the instance is usually referred to by the variable `apm` in this documentation
* [The `Transaction` API](/reference/transaction-api.md) - All functions and properties on the `Transaction` object. An instance of the `Transaction` object is acquired by calling `apm.startTransaction()`
* [The `Span` API](/reference/span-api.md) - All functions and properties on the `Span` object. An instance of the `Span` object is acquired by calling `apm.startSpan()`




