# All development tasks are typically available via npm scripts, i.e.
# `npm run <script> ...`.  This Makefile exists as a convenience for some
# of the common tasks.

.PHONY: all
all:
	npm install

.PHONY: check
check:
	npm run lint

.PHONY: fmt
fmt:
	npm run lint:fix

# Prerequisite: Docker server is running.
# See TESTING.md for more details on tests, TAV tests, coverage, benchmarks.
#
# XXX use --node-arg=<arg> to tap for the various options in test/test.js
#   if (semver.gte(process.version, '12.0.0')) {
#    args.unshift('--unhandled-rejections=strict')
#  } else {
#    args.unshift('--require', path.join(__dirname, '_promise_rejection.js'))
#  }
# XXX and this from script/run_tests.sh: --expose-http2
# XXX or could use NODE_OPTIONS
#
.PHONY: test
test:
	npx tap --no-coverage 'test/**/*.test.js'

# HERE
.PHONY: XXX
XXX:
	find test -name "*.js" | grep -v '\.test\.js' | grep -v '/_'
