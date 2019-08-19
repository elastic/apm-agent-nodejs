# 2.15.0 - 2019/8/15
  * feat(express-graphql): add support for v0.9 ([#1255](https://github.com/elastic/apm-agent-nodejs/pull/1255))
  * feat(metrics): add metricsLimit option ([#1273](https://github.com/elastic/apm-agent-nodejs/pull/1273))

# 2.14.0 - 2019/8/12
  * feat(hapi): support new @hapi/hapi module ([#1246](https://github.com/elastic/apm-agent-nodejs/pull/1246))
  * feat: allow agent.clearPatches to be called with array of names ([#1262](https://github.com/elastic/apm-agent-nodejs/pull/1262))
  * fix: be less chatty if span stack traces cannot be parsed ([#1274](https://github.com/elastic/apm-agent-nodejs/pull/1274))
  * perf: use for-of instead of forEach ([#1275](https://github.com/elastic/apm-agent-nodejs/pull/1275))

# 2.13.0 - 2019/7/30
  * fix: standardize user-agent header ([#1238](https://github.com/elastic/apm-agent-nodejs/pull/1238))
  * feat: add support for APM Agent Configuration via Kibana ([#1197](https://github.com/elastic/apm-agent-nodejs/pull/1197))
  * feat(metrics): breakdown graphs ([#1219](https://github.com/elastic/apm-agent-nodejs/pull/1219))
  * feat(config): default serviceVersion to package version ([#1237](https://github.com/elastic/apm-agent-nodejs/pull/1237))

# 2.12.1 - 2019/7/7
  * fix(knex): abort early on unsupported version of knex ([#1189](https://github.com/elastic/apm-agent-nodejs/pull/1189))

# 2.12.0 - 2019/7/2
  * feat(metrics): add runtime metrics ([#1021](https://github.com/elastic/apm-agent-nodejs/pull/1021))
  * feat(config): add environment option ([#1106](https://github.com/elastic/apm-agent-nodejs/pull/1106))

# 2.11.6 - 2019/6/11
  * fix(express): don't swallow error handling middleware ([#1111](https://github.com/elastic/apm-agent-nodejs/pull/1111))

# 2.11.5 - 2019/5/27
  * fix(metrics): report correct CPU usage on Linux ([#1092](https://github.com/elastic/apm-agent-nodejs/pull/1092))
  * fix(express): improve names for routes added via app.use() ([#1013](https://github.com/elastic/apm-agent-nodejs/pull/1013))

# 2.11.4 - 2019/5/27
  * fix: don't add traceparent header to signed AWS requests ([#1089](https://github.com/elastic/apm-agent-nodejs/pull/1089))

# 2.11.3 - 2019/5/22
  * fix(span): use correct logger location ([#1081](https://github.com/elastic/apm-agent-nodejs/pull/1081))

# 2.11.2 - 2019/5/21
  * fix: url.parse expects req.url not req ([#1074](https://github.com/elastic/apm-agent-nodejs/pull/1074))
  * fix(express-slash): expose express handle properties ([#1070](https://github.com/elastic/apm-agent-nodejs/pull/1070))

# 2.11.1 - 2019/5/10
  * fix(instrumentation): explicitly use `require` ([#1059](https://github.com/elastic/apm-agent-nodejs/pull/1059))
  * chore: add Node.js 12 to package.json engines field ([#1057](https://github.com/elastic/apm-agent-nodejs/pull/1057))

# 2.11.0 - 2019/5/3
  * chore: rename tags to labels ([#1019](https://github.com/elastic/apm-agent-nodejs/pull/1019))
  * feat(config): support global labels ([#1020](https://github.com/elastic/apm-agent-nodejs/pull/1020))
  * fix(config): do not use ELASTIC\_APM\_ prefix for k8s ([#1041](https://github.com/elastic/apm-agent-nodejs/pull/1041))
  * fix(instrumentation): prevent handler leak in bindEmitter ([#1044](https://github.com/elastic/apm-agent-nodejs/pull/1044))

# 2.10.0 - 2019/4/15
  * feat(express-graphql): add support for version ^0.8.0 ([#1010](https://github.com/elastic/apm-agent-nodejs/pull/1010))
  * fix(package): bump elastic-apm-http-client to ^7.2.2 so Kubernetes metadata gets corrected recorded ([#1011](https://github.com/elastic/apm-agent-nodejs/pull/1011))
  * fix(ts): add TypeScript typings for new traceparent API ([#1001](https://github.com/elastic/apm-agent-nodejs/pull/1001))

# 2.9.0 - 2019/4/10
  * feat: add traceparent getter to agent, span and transaction ([#969](https://github.com/elastic/apm-agent-nodejs/pull/969))
  * feat(template): add support for jade and pug ([#914](https://github.com/elastic/apm-agent-nodejs/pull/914))
  * feat(elasticsearch): capture more types of queries ([#967](https://github.com/elastic/apm-agent-nodejs/pull/967))
  * feat: sync flag on spans and transactions ([#980](https://github.com/elastic/apm-agent-nodejs/pull/980))
  * fix(agent): init config/logger before usage ([#956](https://github.com/elastic/apm-agent-nodejs/pull/956))
  * fix: don't add response listener to outgoing requests ([#974](https://github.com/elastic/apm-agent-nodejs/pull/974))
  * fix(agent): fix basedir in debug mode when starting agent with -r ([#981](https://github.com/elastic/apm-agent-nodejs/pull/981))
  * fix: ensure Kubernetes/Docker container info is captured ([#995](https://github.com/elastic/apm-agent-nodejs/pull/995))

# 2.8.0 - 2019/4/2
  * feat: add agent.setFramework() method ([#966](https://github.com/elastic/apm-agent-nodejs/pull/966))
  * feat(config): add usePathAsTransactionName config option ([#907](https://github.com/elastic/apm-agent-nodejs/pull/907))
  * feat(debug): output configuration if logLevel is trace ([#972](https://github.com/elastic/apm-agent-nodejs/pull/972))
  * fix(express): transaction default name is incorrect ([#938](https://github.com/elastic/apm-agent-nodejs/pull/938))

# 2.7.1 - 2019/3/28
  * fix: instrument http/https.get requests ([#954](https://github.com/elastic/apm-agent-nodejs/pull/954))
  * fix: don't add traceparent header to S3 requests ([#952](https://github.com/elastic/apm-agent-nodejs/pull/952))

# 2.7.0 - 2019/3/26
  * feat: add patch registry ([#803](https://github.com/elastic/apm-agent-nodejs/pull/803))
  * feat: allow sub-modules to be patched ([#920](https://github.com/elastic/apm-agent-nodejs/pull/920))
  * feat: add TypeScript typings ([#926](https://github.com/elastic/apm-agent-nodejs/pull/926))
  * fix: update measured-reporting to fix Windows installation issue ([#933](https://github.com/elastic/apm-agent-nodejs/pull/933))
  * fix(lambda): do not wrap context ([#931](https://github.com/elastic/apm-agent-nodejs/pull/931))
  * fix(lambda): fix cloning issues of context ([#947](https://github.com/elastic/apm-agent-nodejs/pull/947))
  * fix(metrics): use noop logger in metrics reporter ([#912](https://github.com/elastic/apm-agent-nodejs/pull/912))
  * fix(transaction): don't set transaction result if it's null ([#936](https://github.com/elastic/apm-agent-nodejs/pull/936))
  * fix(agent): allow flush callback to be undefined ([#934](https://github.com/elastic/apm-agent-nodejs/pull/934))
  * fix: handle promise rejection in case Elasticsearch client throws ([#870](https://github.com/elastic/apm-agent-nodejs/pull/870))
  * chore: change 'npm run' command namespaces ([#944](https://github.com/elastic/apm-agent-nodejs/pull/944))

# 2.6.0 - 2019/3/5
  * feat: add support for Fastify framework ([#594](https://github.com/elastic/apm-agent-nodejs/pull/594))
  * feat(lambda): accept parent span in lambda wrapper ([#881](https://github.com/elastic/apm-agent-nodejs/pull/881))
  * feat(lambda): support promise form ([#871](https://github.com/elastic/apm-agent-nodejs/pull/871))
  * fix: ensure http headers are always recorded as strings ([#895](https://github.com/elastic/apm-agent-nodejs/pull/895))
  * fix(metrics): prevent 0ms timers from being created ([#872](https://github.com/elastic/apm-agent-nodejs/pull/872))
  * fix(config): apiRequestSize should be 768kb ([#848](https://github.com/elastic/apm-agent-nodejs/pull/848))
  * fix(express): ensure correct transaction names ([#842](https://github.com/elastic/apm-agent-nodejs/pull/842))

# 2.5.1 - 2019/2/4
  * fix(metrics): ensure NaN becomes 0, not null ([#837](https://github.com/elastic/apm-agent-nodejs/pull/837)) 

# 2.5.0 - 2019/1/29
  * feat(metrics): added basic metrics gathering ([#731](https://github.com/elastic/apm-agent-nodejs/pull/731)) 

# 2.4.0 - 2019/1/24
  * feat: add ability to set custom log message for errors ([#824](https://github.com/elastic/apm-agent-nodejs/pull/824))
  * feat: add ability to set custom timestamp for errors ([#823](https://github.com/elastic/apm-agent-nodejs/pull/823))
  * feat: add support for custom start/end times ([#818](https://github.com/elastic/apm-agent-nodejs/pull/818))

# 2.3.0 - 2019/1/22
  * fix(parsers): move port fix into parser ([#820](https://github.com/elastic/apm-agent-nodejs/pull/820))
  * fix(mongo): support 3.1.10+ ([#793](https://github.com/elastic/apm-agent-nodejs/pull/793)) 
  * feat(config): add captureHeaders config ([#788](https://github.com/elastic/apm-agent-nodejs/pull/788))
  * feat(config): add container info options ([#766](https://github.com/elastic/apm-agent-nodejs/pull/766))

# 2.2.1 - 2019/1/21
  * fix: ensure request.url.port is a string on transactions ([#814](https://github.com/elastic/apm-agent-nodejs/pull/814))

# 2.2.0 - 2019/1/21
  * feat(koa): record framework name and version ([#810](https://github.com/elastic/apm-agent-nodejs/pull/810))
  * feat(cassandra): support 4.x ([#784](https://github.com/elastic/apm-agent-nodejs/pull/784))
  * feat(config): validate serverUrl port ([#795](https://github.com/elastic/apm-agent-nodejs/pull/795))
  * feat: add transaction.type to errors ([#805](https://github.com/elastic/apm-agent-nodejs/pull/805))
  * fix: filter outgoing http headers with any case ([#799](https://github.com/elastic/apm-agent-nodejs/pull/799))
  * fix: we don't support mongodb-core v3.1.10+ ([#792](https://github.com/elastic/apm-agent-nodejs/pull/792))

# 2.1.0 - 2019/1/15
  * feat(error): include sampled flag on errors ([#767](https://github.com/elastic/apm-agent-nodejs/pull/767))
  * feat(span): add tags to spans ([#757](https://github.com/elastic/apm-agent-nodejs/pull/757))
  * fix(tedious): don't fail on newest tedious v4.1.3 ([#775](https://github.com/elastic/apm-agent-nodejs/pull/775))
  * fix(graphql): fix span name for unknown queries ([#756](https://github.com/elastic/apm-agent-nodejs/pull/756))

# 2.0.6 - 2018/12/18
  * fix(graphql): don't throw on invalid query ([#747](https://github.com/elastic/apm-agent-nodejs/pull/747))
  * fix(koa-router): support more complex routes ([#749](https://github.com/elastic/apm-agent-nodejs/pull/749))

# 2.0.5 - 2018/12/12
  * fix: don't create spans for APM Server requests ([#735](https://github.com/elastic/apm-agent-nodejs/pull/735))

# 2.0.4 - 2018/12/7
  * chore: update engines field in package.json ([#727](https://github.com/elastic/apm-agent-nodejs/pull/727))
  * chore(package): bump random-poly-fill to ^1.0.1 ([#726](https://github.com/elastic/apm-agent-nodejs/pull/726))

# 2.0.3 - 2018/12/7
  * fix(restify): support an array of handlers ([#709](https://github.com/elastic/apm-agent-nodejs/pull/709))
  * fix: don't throw on older versions of Node.js 6 ([#711](https://github.com/elastic/apm-agent-nodejs/pull/711))

# 2.0.2 - 2018/12/4
  * fix: use randomFillSync polyfill on Node.js <6.13.0 ([#702](https://github.com/elastic/apm-agent-nodejs/pull/702))
  * fix(hapi): ignore internal events channel ([#700](https://github.com/elastic/apm-agent-nodejs/pull/700))

# 2.0.1 - 2018/11/26
  * fix: log APM Server API errors correctly ([#692](https://github.com/elastic/apm-agent-nodejs/pull/692))

# 2.0.0 - 2018/11/14
  * Breaking changes:
    * chore: remove support for Node.js 4 and 9
    * chore: remove deprecated buildSpan function ([#642](https://github.com/elastic/apm-agent-nodejs/pull/642))
    * feat: support APM Server intake API version 2 ([#465](https://github.com/elastic/apm-agent-nodejs/pull/465))
    * feat: improved filtering function API ([#579](https://github.com/elastic/apm-agent-nodejs/pull/579))
    * feat: replace double-quotes with underscores in tag names ([#666](https://github.com/elastic/apm-agent-nodejs/pull/666))
    * feat(config): change config order ([#604](https://github.com/elastic/apm-agent-nodejs/pull/604))
    * feat(config): support time suffixes ([#602](https://github.com/elastic/apm-agent-nodejs/pull/602))
    * feat(config): stricter boolean parsing ([#613](https://github.com/elastic/apm-agent-nodejs/pull/613))
  * feat: add support for Distributed Tracing ([#538](https://github.com/elastic/apm-agent-nodejs/pull/538))
  * feat(transaction): add transaction.ensureParentId function ([#661](https://github.com/elastic/apm-agent-nodejs/pull/661))
  * feat(config): support byte suffixes ([#601](https://github.com/elastic/apm-agent-nodejs/pull/601))
  * feat(transaction): restructure span\_count and include total ([#553](https://github.com/elastic/apm-agent-nodejs/pull/553))
  * perf: improve Async Hooks implementation ([#679](https://github.com/elastic/apm-agent-nodejs/pull/679))

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
