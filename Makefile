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
