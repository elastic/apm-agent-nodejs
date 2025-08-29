---
mapped_pages:
  - https://www.elastic.co/guide/en/apm/agent/nodejs/current/source-maps.html
applies_to:
  stack:
  serverless:
    observability:
  product:
    apm_agent_node: ga
products:
  - id: cloud-serverless
  - id: observability
  - id: apm
---

# Source map support [source-maps]

The Elastic APM Node.js agent supports source maps by default. If you transpile your source code and supply a source map, the agent will be able to collect the correct stack traces and even the original source code if available.

To take advantage of this, simply make sure that your transpiled source code contains a `sourceMappingURL` comment at the bottom of each JavaScript file. It can either point to a source map file on disk:

```js
//# sourceMappingURL=/path/to/file.js.map
```

Or you can inline the source map using base64 encoding:

```js
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiIiwic291cmNlcyI6WyJmb28uanMiLCJiYXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O1VBQ0c7Ozs7Ozs7Ozs7Ozs7O3NCQ0RIO3NCQUNBIn0=
```

All modern build toolchains support generating source maps and adding these comments to the transpiled source code.


## Original source code [original-source-code]

Elastic APM uses source maps for two purposes: to collect stack traces that point to your original source code, *and* to collect the original source code as inline code snippets related to each frame in your stack traces.

For optimal support, we recommend that you either inline the original source code using the `sourcesContent` property inside the source map, or that you deploy the original source code to your production server along with the transpiled source code.

If you choose to deploy the original source code, make sure that it’s accessible via the file system at the path specified with the `sourceRoot` property in the source map.


## Public access? [public-access]

Your source maps or original source code **does not** need to be available via the internet. Everything is handled by the local Node.js agent on your server.

