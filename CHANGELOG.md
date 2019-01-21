# 1.14.5 - 2019/1/21
  * fix(graphql): don't throw on invalid query (#747) ([#761](https://github.com/elastic/apm-agent-nodejs/pull/761))
  * fix: we don't support mongodb-core v3.1.10+ (#792) ([#800](https://github.com/elastic/apm-agent-nodejs/pull/800))

# 1.14.4 - 2018/12/7
  * fix(restify): support an array of handlers (#709) ([#721](https://github.com/elastic/apm-agent-nodejs/pull/721))
  * fix(hapi): ignore internal events channel (#700) ([#720](https://github.com/elastic/apm-agent-nodejs/pull/720))

# 1.14.3 - 2018/11/13
  * fix(async\_hooks): more reliable cleanup ([#674](https://github.com/elastic/apm-agent-nodejs/pull/674))

# 1.14.2 - 2018/11/10
  * fix: prevent memory leak due to potential reference cycle ([#667](https://github.com/elastic/apm-agent-nodejs/pull/667))

# 1.14.1 - 2018/11/8
  * fix: promise.then() resolve point ([#663](https://github.com/elastic/apm-agent-nodejs/pull/663))

# 1.14.0 - 2018/11/6
  * feat(agent): return uuid in captureError callback ([#636](https://github.com/elastic/apm-agent-nodejs/pull/636))
  * feat(apollo-server-express): set custom GraphQL transaction names ([#648](https://github.com/elastic/apm-agent-nodejs/pull/648))
  * feat(finalhandler): improve capturing of errors in Express ([#629](https://github.com/elastic/apm-agent-nodejs/pull/629))
  * fix(http): bind writeHead to transaction ([#637](https://github.com/elastic/apm-agent-nodejs/pull/637))
  * fix(shimmer): safely handle property descriptors ([#634](https://github.com/elastic/apm-agent-nodejs/pull/634))

# 1.13.0 - 2018/10/19
  * feat(ioredis): add support for ioredis version 4.x ([#516](https://github.com/elastic/apm-agent-nodejs/pull/516))
  * fix(ws): allow disabling WebSocket instrumentation ([#599](https://github.com/elastic/apm-agent-nodejs/pull/599))
  * fix: allow flushInterval to be set from env ([#568](https://github.com/elastic/apm-agent-nodejs/pull/568))
  * fix: default transactionMaxSpans to 500 ([#567](https://github.com/elastic/apm-agent-nodejs/pull/567))

# 1.12.0 - 2018/8/31
  * feat(restify): add Restify instrumentation ([#517](https://github.com/elastic/apm-agent-nodejs/pull/517))
  * feat(config): default serviceName to package name ([#508](https://github.com/elastic/apm-agent-nodejs/pull/508))
  * fix: always call agent.flush() callback ([#537](https://github.com/elastic/apm-agent-nodejs/pull/537))

# 1.11.0 - 2018/8/15
  * feat(filters): filter set-cookie headers ([#485](https://github.com/elastic/apm-agent-nodejs/pull/485))
  * fix(express): cannot create property symbol ([#510](https://github.com/elastic/apm-agent-nodejs/pull/510))

# 1.10.2 - 2018/8/8
  * fix: ensure logger config can update ([#503](https://github.com/elastic/apm-agent-nodejs/pull/503))
  * perf: improve request body parsing speed ([#492](https://github.com/elastic/apm-agent-nodejs/pull/492))

# 1.10.1 - 2018/7/31
  * fix(graphql): handle execute args object ([#484](https://github.com/elastic/apm-agent-nodejs/pull/484))

# 1.10.0 - 2018/7/30
  * feat(cassandra): instrument Cassandra queries ([#437](https://github.com/elastic/apm-agent-nodejs/pull/437))
  * feat(mssql): instrument SQL Server queries ([#444](https://github.com/elastic/apm-agent-nodejs/pull/444))

# 1.9.0 - 2018/7/25
  * fix(parsers): use basic-auth rather than req.auth ([#475](https://github.com/elastic/apm-agent-nodejs/pull/475))
  * feat(agent): add currentTransaction getter ([#462](https://github.com/elastic/apm-agent-nodejs/pull/462))
  * feat: add support for ws 6.x ([#464](https://github.com/elastic/apm-agent-nodejs/pull/464))

# 1.8.3 - 2018/7/11
  * perf: don't patch newer versions of mimic-response ([#442](https://github.com/elastic/apm-agent-nodejs/pull/442))

# 1.8.2 - 2018/7/4
  * fix: ensure correct streaming when using mimic-response ([#429](https://github.com/elastic/apm-agent-nodejs/pull/429))

# 1.8.1 - 2018/6/27
  * fix: improve ability to run in an environment with muliple APM vendors ([#417](https://github.com/elastic/apm-agent-nodejs/pull/417)) (via [require-in-the-middle#11](https://github.com/elastic/require-in-the-middle/issues/11))

# 1.8.0 - 2018/6/23
  * feat: truncate very long error messages ([#413](https://github.com/elastic/apm-agent-nodejs/pull/413))
  * fix: be unicode aware when truncating body ([#412](https://github.com/elastic/apm-agent-nodejs/pull/412))

# 1.7.1 - 2018/6/20
  * fix(express-queue): retain continuity through express-queue ([#396](https://github.com/elastic/apm-agent-nodejs/pull/396))

# 1.7.0 - 2018/6/18
  * feat(mysql): support mysql2 module ([#298](https://github.com/elastic/apm-agent-nodejs/pull/298))
  * feat(graphql): add support for the upcoming GraphQL v14.x ([#399](https://github.com/elastic/apm-agent-nodejs/pull/399))
  * feat(config): add option to disable certain instrumentations ([#353](https://github.com/elastic/apm-agent-nodejs/pull/353))
  * feat(http2): instrument client requests ([#326](https://github.com/elastic/apm-agent-nodejs/pull/326))
  * fix: get remoteAddress before HTTP request close event ([#384](https://github.com/elastic/apm-agent-nodejs/pull/384))
  * fix: improve capture of spans when EventEmitter is in use ([#371](https://github.com/elastic/apm-agent-nodejs/pull/371))

# 1.6.0 - 2018/5/28
  * feat(http2): instrument incoming http2 requests ([#205](https://github.com/elastic/apm-agent-nodejs/pull/205))
  * fix(agent): allow agent.endTransaction() to set result ([#350](https://github.com/elastic/apm-agent-nodejs/pull/350))

# 1.5.4 - 2018/5/15
  * chore: allow Node.js 10 in package.json engines field ([#345](https://github.com/elastic/apm-agent-nodejs/pull/345))

# 1.5.3 - 2018/5/14
  * fix: guard against non string err.message

# 1.5.2 - 2018/5/11
  * fix(express): string errors should not be reported

# 1.5.1 - 2018/5/10
  * fix: don't throw if span callsites can't be collected

# 1.5.0 - 2018/5/9
  * feat: add agent.addTags() method ([#313](https://github.com/elastic/apm-agent-nodejs/pull/313))
  * feat: add agent.isStarted() method ([#311](https://github.com/elastic/apm-agent-nodejs/pull/311))
  * feat: allow calling transaction.end() with transaction result ([#328](https://github.com/elastic/apm-agent-nodejs/pull/328))
  * fix: encode spans even if their stack trace can't be captured ([#321](https://github.com/elastic/apm-agent-nodejs/pull/321))
  * fix(config): restore custom logger feature ([#299](https://github.com/elastic/apm-agent-nodejs/pull/299))
  * fix(doc): lambda getting started had old argument ([#296](https://github.com/elastic/apm-agent-nodejs/pull/296))

# 1.4.0 - 2018/4/9
  * feat(lambda): implement manual lambda instrumentation ([#234](https://github.com/elastic/apm-agent-nodejs/pull/234))

# 1.3.0 - 2018/3/22
  * feat(request): include ppid ([#286](https://github.com/elastic/apm-agent-nodejs/pull/286))

# 1.2.1 - 2018/3/15
  * fix(span): Do not pass stack frames into promises (memory leak fix) ([#269](https://github.com/elastic/apm-agent-nodejs/pull/269))

# 1.2.0 - 2018/3/13
  * feat(config): add serverTimeout ([#238](https://github.com/elastic/apm-agent-nodejs/pull/238))
  * fix(config): set default maxQueueSize to 100 ([#270](https://github.com/elastic/apm-agent-nodejs/pull/270))
  * feat(ws): add support for ws v5 ([#267](https://github.com/elastic/apm-agent-nodejs/pull/267))

# 1.1.1 - 2018/3/4
  * fix(mongodb): don't throw if span cannot be built ([#265](https://github.com/elastic/apm-agent-nodejs/pull/265))

# 1.1.0 - 2018/2/28
  * feat: add agent.startSpan() function ([#262](https://github.com/elastic/apm-agent-nodejs/pull/262))
  * feat(debug): output more debug info on start ([#254](https://github.com/elastic/apm-agent-nodejs/pull/254))

# 1.0.3 - 2018/2/14
  * fix: ensure context.url.full property is truncated if too long ([#242](https://github.com/elastic/apm-agent-nodejs/pull/242))

# 1.0.2 - 2018/2/13
  * fix(express): prevent invalid errors from crashing ([#240](https://github.com/elastic/apm-agent-nodejs/pull/240))

# 1.0.1 - 2018/2/9
  * fix: don't add req/res to unsampled transactions ([#236](https://github.com/elastic/apm-agent-nodejs/pull/236))

# 1.0.0 - 2018/2/6
  * feat(instrumentation): support sampling ([#154](https://github.com/elastic/apm-agent-nodejs/pull/154))
  * feat(transaction): add `transactionMaxSpans` config option ([#170](https://github.com/elastic/apm-agent-nodejs/pull/170))
  * feat(errors): add captureError call location stack trace ([#181](https://github.com/elastic/apm-agent-nodejs/pull/181))
  * feat: allow setting of framework name and version ([#228](https://github.com/elastic/apm-agent-nodejs/pull/228))
  * feat(protcol): add `url.full` to intake API payload ([#166](https://github.com/elastic/apm-agent-nodejs/pull/166))
  * refactor(config): replace `logBody` with `captureBody` ([#214](https://github.com/elastic/apm-agent-nodejs/pull/214))
  * refactor(config): unify config options with python ([#213](https://github.com/elastic/apm-agent-nodejs/pull/213))
  * fix: don't collect source code for in-app span frames by default ([#229](https://github.com/elastic/apm-agent-nodejs/pull/229))
  * fix(protocol): report dropped span counts in intake API payload ([#172](https://github.com/elastic/apm-agent-nodejs/pull/172))
  * refactor(protocol): always include handled flag in intake API payload ([#191](https://github.com/elastic/apm-agent-nodejs/pull/191))
  * refactor(protocol): move process fields to own namespace in intake API payload ([#155](https://github.com/elastic/apm-agent-nodejs/pull/155))
  * refactor(protocol): rename `uncaught` to `handled` in intake API payload ([#140](https://github.com/elastic/apm-agent-nodejs/pull/140))
  * refactor(protocol): rename `in_app` to `library_frame` in intake API payload ([#96](https://github.com/elastic/apm-agent-nodejs/pull/96))
  * refactor: rename app to service ([#93](https://github.com/elastic/apm-agent-nodejs/pull/93))
  * refactor: rename trace to span ([#92](https://github.com/elastic/apm-agent-nodejs/pull/92))

# 0.12.0 - 2018/1/24
  * feat(\*): control amount of source context lines collected using new config options ([#196](https://github.com/elastic/apm-agent-nodejs/pull/196))
  * feat(agent): add public flush function to force flush of transaction queue: agent.flush([callback]) ([#187](https://github.com/elastic/apm-agent-nodejs/pull/187))
  * feat(mongodb): add support for mongodb-core 3.x ([#190](https://github.com/elastic/apm-agent-nodejs/pull/190))
  * refactor(config): update default flushInterval to 10 seconds (lower memory usage) ([#186](https://github.com/elastic/apm-agent-nodejs/pull/186))
  * chore(\*): drop support for Node.js 5 and 7 ([#169](https://github.com/elastic/apm-agent-nodejs/pull/169))
  * refactor(instrumentation): encode transactions as they are added to the queue (lower memory usage) ([#184](https://github.com/elastic/apm-agent-nodejs/pull/184))

# 0.11.0 - 2018/1/11
  * feat(\*): Set default stack trace limit to 50 frames ([#171](https://github.com/elastic/apm-agent-nodejs/pull/171))
  * feat(ws): add support for ws@4.x ([#164](https://github.com/elastic/apm-agent-nodejs/pull/164))
  * feat(errors): associate errors with active transaction

# 0.10.0 - 2018/1/3
  * feat(express): auto-track errors (BREAKING CHANGE: removed express middleware) ([#127](https://github.com/elastic/apm-agent-nodejs/pull/127))
  * feat(hapi): add hapi 17 support ([#146](https://github.com/elastic/apm-agent-nodejs/pull/146))
  * fix(\*): fix Node.js 8 support using async\_hooks ([#77](https://github.com/elastic/apm-agent-nodejs/pull/77))
  * fix(graphql): support sync execute ([#139](https://github.com/elastic/apm-agent-nodejs/pull/139))
  * refactor(agent): make all config properties private (BREAKING CHANGE) ([#107](https://github.com/elastic/apm-agent-nodejs/pull/107))

# 0.9.0 - 2017/12/15
  * feat(conf): allow serverUrl to contain a sub-path ([#116](https://github.com/elastic/apm-agent-nodejs/pull/116))
  * refactor(\*): better format of error messages from the APM Server ([#108](https://github.com/elastic/apm-agent-nodejs/pull/108))

# 0.8.1 - 2017/12/13
  * docs(\*): we're now in beta! ([#103](https://github.com/elastic/apm-agent-nodejs/pull/103))

# 0.8.0 - 2017/12/13
  * feat(handlebars): instrument handlebars ([#98](https://github.com/elastic/apm-agent-nodejs/pull/98))

# 0.7.0 - 2017/12/6
  * feat(parser): add sourceContext config option to control if code snippets are sent to the APM Server ([#87](https://github.com/elastic/apm-agent-nodejs/pull/87))
  * fix(\*): move https-pem to list of devDependencies

# 0.6.0 - 2017/11/17
  * feat(queue): add maxQueueSize config option ([#56](https://github.com/elastic/apm-agent-nodejs/pull/56))

# 0.5.0 - 2017/11/17
  * refactor(\*): drop support for Node.js <4 ([#65](https://github.com/elastic/apm-agent-nodejs/pull/65))
  * refactor(\*): rename module to elastic-apm-node ([#71](https://github.com/elastic/apm-agent-nodejs/pull/71))
  * feat(queue): add fuzziness to flushInterval ([#63](https://github.com/elastic/apm-agent-nodejs/pull/63))

# 0.4.0 - 2017/11/15
  * fix(https): instrument https.request in Node.js v9
  * refactor(http): log HTTP results in groups of 100 ([#68](https://github.com/elastic/apm-agent-nodejs/pull/68))
  * fix(api): add language to APM Server requests ([#64](https://github.com/elastic/apm-agent-nodejs/pull/64))
  * refactor(trans): set default transaction.result to success ([#67](https://github.com/elastic/apm-agent-nodejs/pull/67))
  * refactor(config): rename timeout config options ([#59](https://github.com/elastic/apm-agent-nodejs/pull/59))

# 0.3.1 - 2017/10/3
  * fix(parsers): don't log context.request.url.search as null ([#48](https://github.com/elastic/apm-agent-nodejs/pull/48))
  * fix(parsers): separate hostname and port when parsing Host header ([#47](https://github.com/elastic/apm-agent-nodejs/pull/47))

# 0.3.0 - 2017/9/20
  * fix(instrumentation): don't sample transactions ([#40](https://github.com/elastic/apm-agent-nodejs/pull/40))
  * feat(graphql): include GraphQL operation name in trace and transaction names ([#27](https://github.com/elastic/apm-agent-nodejs/pull/27))
  * feat(tls): add validateServerCert config option ([#32](https://github.com/elastic/apm-agent-nodejs/pull/32))
  * feat(parser): support http requests with full URI's ([#26](https://github.com/elastic/apm-agent-nodejs/pull/26))
  * refactor(\*): remove appGitRef config option
  * fix(instrumentation): fix setting of custom flushInterval
  * feat(elasticsearch): add simple Elasticsearch instrumentation
  * fix(\*): don't start agent if appName is invalid

# 0.2.0 - 2017/8/28
  * refactor(\*): support new default port 8200 in APM Server
  * refactor(\*): support new context.response status code format

# 0.1.1 - 2017/8/17
  * fix(instrumentation): don't fail when sending transactions to APM Server

# 0.1.0 - 2017/8/17
  * Initial release
