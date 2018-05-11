# 1.5.2 - 2018/5/11
  * fix(express): string errors should not be reported

# 1.5.1 - 2018/5/10
  * fix: don't throw if span callsites can't be collected

# 1.5.0 - 2018/5/9
  * feat: add agent.addTags() method (#313)
  * feat: add agent.isStarted() method (#311)
  * feat: allow calling transaction.end() with transaction result (#328)
  * fix: encode spans even if their stack trace can't be captured (#321)
  * fix(config): restore custom logger feature (#299)
  * fix(doc): lambda getting started had old argument (#296)

# 1.4.0 - 2018/4/9
  * feat(lambda): implement manual lambda instrumentation (#234)

# 1.3.0 - 2018/3/22
  * feat(request): include ppid (#286)

# 1.2.1 - 2018/3/15
  * fix(span): Do not pass stack frames into promises (memory leak fix) (#269)

# 1.2.0 - 2018/3/13
  * feat(config): add serverTimeout (#238)
  * fix(config): set default maxQueueSize to 100 (#270)
  * feat(ws): add support for ws v5 (#267)

# 1.1.1 - 2018/3/4
  * fix(mongodb): don't throw if span cannot be built (#265)

# 1.1.0 - 2018/2/28
  * feat: add agent.startSpan() function (#262)
  * feat(debug): output more debug info on start (#254)

# 1.0.3 - 2018/2/14
  * fix: ensure context.url.full property is truncated if too long (#242)

# 1.0.2 - 2018/2/13
  * fix(express): prevent invalid errors from crashing (#240)

# 1.0.1 - 2018/2/9
  * fix: don't add req/res to unsampled transactions (#236)

# 1.0.0 - 2018/2/6
  * feat(instrumentation): support sampling (#154)
  * feat(transaction): add `transactionMaxSpans` config option (#170)
  * feat(errors): add captureError call location stack trace (#181)
  * feat: allow setting of framework name and version (#228)
  * feat(protcol): add `url.full` to intake API payload (#166)
  * refactor(config): replace `logBody` with `captureBody` (#214)
  * refactor(config): unify config options with python (#213)
  * fix: don't collect source code for in-app span frames by default (#229)
  * fix(protocol): report dropped span counts in intake API payload (#172)
  * refactor(protocol): always include handled flag in intake API payload (#191)
  * refactor(protocol): move process fields to own namespace in intake API payload (#155)
  * refactor(protocol): rename `uncaught` to `handled` in intake API payload (#140)
  * refactor(protocol): rename `in_app` to `library_frame` in intake API payload (#96)
  * refactor: rename app to service (#93)
  * refactor: rename trace to span (#92)

# 0.12.0 - 2018/1/24
  * feat(\*): control amount of source context lines collected using new config options (#196)
  * feat(agent): add public flush function to force flush of transaction queue: agent.flush([callback]) (#187)
  * feat(mongodb): add support for mongodb-core 3.x (#190)
  * refactor(config): update default flushInterval to 10 seconds (lower memory usage) (#186)
  * chore(\*): drop support for Node.js 5 and 7 (#169)
  * refactor(instrumentation): encode transactions as they are added to the queue (lower memory usage) (#184)

# 0.11.0 - 2018/1/11
  * feat(\*): Set default stack trace limit to 50 frames (#171)
  * feat(ws): add support for ws@4.x (#164)
  * feat(errors): associate errors with active transaction

# 0.10.0 - 2018/1/3
  * feat(express): auto-track errors (BREAKING CHANGE: removed express middleware) (#127)
  * feat(hapi): add hapi 17 support (#146)
  * fix(\*): fix Node.js 8 support using async\_hooks (#77)
  * fix(graphql): support sync execute (#139)
  * refactor(agent): make all config properties private (BREAKING CHANGE) (#107)

# 0.9.0 - 2017/12/15
  * feat(conf): allow serverUrl to contain a sub-path (#116)
  * refactor(\*): better format of error messages from the APM Server (#108)

# 0.8.1 - 2017/12/13
  * docs(\*): we're now in beta! (#103)

# 0.8.0 - 2017/12/13
  * feat(handlebars): instrument handlebars (#98)

# 0.7.0 - 2017/12/6
  * feat(parser): add sourceContext config option to control if code snippets are sent to the APM Server (#87)
  * fix(\*): move https-pem to list of devDependencies

# 0.6.0 - 2017/11/17
  * feat(queue): add maxQueueSize config option (#56)

# 0.5.0 - 2017/11/17
  * refactor(\*): drop support for Node.js <4 (#65)
  * refactor(\*): rename module to elastic-apm-node (#71)
  * feat(queue): add fuzziness to flushInterval (#63)

# 0.4.0 - 2017/11/15
  * fix(https): instrument https.request in Node.js v9
  * refactor(http): log HTTP results in groups of 100 (#68)
  * fix(api): add language to APM Server requests (#64)
  * refactor(trans): set default transaction.result to success (#67)
  * refactor(config): rename timeout config options (#59)

# 0.3.1 - 2017/10/3
  * fix(parsers): don't log context.request.url.search as null (#48)
  * fix(parsers): separate hostname and port when parsing Host header (#47)

# 0.3.0 - 2017/9/20
  * fix(instrumentation): don't sample transactions (#40)
  * feat(graphql): include GraphQL operation name in trace and transaction names (#27)
  * feat(tls): add validateServerCert config option (#32)
  * feat(parser): support http requests with full URI's (#26)
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
