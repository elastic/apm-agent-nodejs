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
.PHONY: test
test:
	npm run test

# List the license types of all runtime (non-dev) dependencies
.PHONY: list-dep-licenses
list-dep-licenses:
	@(npm ls --omit=dev --all --parseable \
		| while read subdir; do node -e "console.log(require('$$subdir/package.json').license)"; done \
		| sort | uniq -c | sort -n)

# Include devDependencies in this listing of licenses.
.PHONY: list-all-dep-licenses
list-all-dep-licenses:
	@(npm ls --all --parseable \
		| while read subdir; do node -e "console.log(require('$$subdir/package.json').license)"; done \
		| sort | uniq -c | sort -n)

.PHONY: list-deps-without-license-field
list-deps-without-license-field:
	@(npm ls --all --parseable \
		| while read subdir; do if [[ $$(node -e "console.log(require('$$subdir/package.json').license)") == "undefined" ]]; then echo $$subdir; fi ; done)
