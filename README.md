# Opbeat for Node.js

[![Build status](https://travis-ci.org/opbeat/opbeat-node.svg?branch=master)](https://travis-ci.org/opbeat/opbeat-node)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard)
<a href="https://opbeat.com" title="Opbeat"><img src="http://opbeat-brand-assets.s3-website-us-east-1.amazonaws.com/svg/logo/logo.svg" align="right" height="25px"></a>

This is the official Node.js agent for Opbeat. 

[Opbeat](https://opbeat.com/nodejs) provides instant performance insights, built for Node.js developers. 

If you are looking for a module for your frontend JS applications, please see [Opbeat for JS](https://github.com/opbeat/opbeat-js) on GitHub.

**Troubleshooting:** If you encounter any problems setting up the Opbeat
agent, please see our [troubleshooting
guide](https://opbeat.com/docs/articles/troubleshooting-opbeat-for-nodejs/).


## Quick start

Install the module:

```
npm install opbeat --save
```

To get started just require and start the Opbeat agent **at the very
top** of your app's startup script. The Opbeat agent will be returned. The
agent will now instrument your Node.js application and track unhandled
exceptions automatically.

```js
// Add this snippet to the VERY top of your app's startup script
var opbeat = require('opbeat').start({
  appId: '...',
  organizationId: '...',
  secretToken: '...'
})
```

If you want to manually send an error to Opbeat, use the
`captureError()` function:

```js
opbeat.captureError(new Error('Ups, something broke'))
```

## Documentation

- [Documentation overview](https://opbeat.com/docs/topics/node-js/)
- [Get started with Express](https://opbeat.com/docs/articles/get-started-with-express/) 
- [Get started with Hapi](https://opbeat.com/docs/articles/get-started-with-hapi/)
- [Module API](https://opbeat.com/docs/articles/opbeat-for-nodejs-api/)
- [Troubleshooting
guide](https://opbeat.com/docs/articles/troubleshooting-opbeat-for-nodejs/)
- [Compatibility with other modules](https://github.com/opbeat/opbeat-node/wiki/Compatibility-Guide)
- [Upgrading to v3](https://github.com/opbeat/opbeat-node/wiki/Upgrade-to-version-3.x)

## Testing

The test suite expects the databases PostgreSQL, MySQL, MongoDB and
Redis to be present. The `npm test` command will try and start them all
automatically before running the tests. This should work on OS X if the
databases are all installed using [Homebrew](http://brew.sh).

## License

BSD-2-Clause

<br>Made with ♥️ and ☕️ by Opbeat and our community.
