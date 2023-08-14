# Contributing to the APM Agent

The APM Agent is open source and we love to receive contributions from our community — you!

There are many ways to contribute,
from writing tutorials or blog posts,
improving the documentation,
submitting bug reports and feature requests or writing code.

You can get in touch with us through [Discuss](https://discuss.elastic.co/tags/c/apm/nodejs),
feedback and ideas are always welcome.

## Code contributions

If you have a bugfix or new feature that you would like to contribute,
please find or open an issue about it first.
Talk about what you would like to do.
It may be that somebody is already working on it,
or that there are particular issues that you should know about before implementing the change.

### Submitting your changes

Generally, we require that you test any code you are adding or modifying.
Once your changes are ready to submit for review:

1. Sign the Contributor License Agreement (CLA)

    Please make sure you have signed our [Contributor License Agreement](https://www.elastic.co/contributor-agreement/).
    We are not asking you to assign copyright to us,
    but to give us the right to distribute your code without restriction.
    We ask this of all contributors in order to assure our users of the origin and continuing existence of the code.
    You only need to sign the CLA once.

2. Test your changes

        npm test     # requires a local Docker

    If you are adding new code or changing existing code, write some automated
    tests that exercise this code.
    See [the TESTING.md doc](./TESTING.md) for details.

3. Document your changes

    * See the [Commit message guidelines](#commit-message-guidelines) below.
    * If your changes will be visible to users of this package, then add an item
      to the "Unreleased" section of [the changelog](./CHANGELOG.asciidoc).
    * If you are changing usage of this package, are there updates under
      "docs/" that should be made?

3. Rebase your changes

    Update your local repository with the most recent code from the main repo,
    and rebase your branch on top of the latest main branch.
    We prefer your initial changes to be squashed into a single commit.
    Later, if we ask you to make changes, add them as separate commits.
    This makes them easier to review.

4. Submit a pull request

    Push your local changes to your forked copy of the repository and [submit a pull request](https://help.github.com/articles/using-pull-requests).
    In the pull request,
    choose a title which sums up the changes that you have made,
    and in the body provide more details about what your changes do.
    Also mention the number of the issue where discussion has taken place,
    e.g. "Closes: #123".

5. Be patient

    We might not be able to review your code as fast as we would like to,
    but we'll do our best to dedicate it the attention it deserves.
    Your effort is much appreciated!

### Commit message guidelines

This repo *loosely* encourages commit messages per [Conventional
Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).

```
[optional type, e.g. "fix:", "feat:"] <description>

[Optional body paragraphs.]

[Optional "BREAKING CHANGE: ..." paragraphs.]

[Optional footers, e.g. "Fixes: #123" or "Co-authored-by: ...".]
```

1. The first line should contain **a short description of the change.**
   Ideally a description is less than 50 characters, and certainly less than 72.

2. The first line may optionally be prefixed with a *type*:
    * "fix:" when fixing a bug
    * "feat:" when adding a new feature
    * "docs:" when only updating documentation
    * "refactor:" when refactoring code without changing functional behavior
    * "test:" when only updating tests
    * "perf:" when improving performance without changing functional behavior
    * "chore:" when making some other task that does not change functional behavior

2. The second line MUST be blank.

3. Optionally provide **body paragraphs that explain the what and why of the
   change,** and not the how.

3. Wrap all lines at 72 columns, within reason (URLs, quoted output).

4. If your commit introduces a breaking change, it should (*strongly
   encouraged*) contain a "BREAKING CHANGE: ..." paragraph, explaining the
   reason for the change, which situations would trigger the breaking change,
   and what is the exact change.

5. If fixing an open issue, add a footer block of the form `Fixes: #123` or
   `Closes: #123`.

Of these guidelines, #1 and #3 are the most important. A succinct description
and a body that answers "what" and "why" will best help future maintainers of
the software.

An example:

```
feat: initial ESM support

This adds initial and ECMAScript Module (ESM) support, i.e. `import ...`,
via the `--experimental-loader=elastic-apm-node/loader.mjs` node option.
This instruments a subset of modules -- more will follow in subsequent changes.

Other changes:
- Fixes a fastify instrumentation issue where the exported `fastify.errorCodes`
  was broken by instrumentation (both CJS and ESM).
- Adds a `runTestFixtures` utility that should be useful for running out of
  process instrumentation/agent tests.

Closes: #1952
Refs: #2343
```


### Testing

For information about how to run the test suite, see [TESTING.md](TESTING.md).


### Adding support for new modules

The following is an overview of what's required in order to add support to the agent for automatic instrumentation of an npm package.

1. Add the instrumentation logic to a new file in the [`lib/instrumentation/modules`](lib/instrumentation/modules) directory named `<package-name>.js`,
   E.g. `mysql.js` for the `mysql` package
1. Add the name of the package to the `MODULES` array in [`lib/instrumentation/index.js`](lib/instrumentation/index.js)
1. Add accompanying tests in the [`test/instrumentation/modules`](test/instrumentation/modules) directory.
   If you only have one test file,
   place it in the root of the `modules` directory and name it the same as the `lib` file.
   If you have more than one test file,
   create a sub-directory with the name of the package and place all test files inside that
   1. If you created a sub-directory under `test/instrumentation/modules`,
      add it to the `directories` array in [`test/test.js`](test/test.js)
1. List the supported versions of the package in [`docs/supported-technologies.asciidoc`](docs/supported-technologies.asciidoc)
1. We use the [test-all-versions](https://github.com/watson/test-all-versions) module to test the agent against all supported versions of each package we instrument.
   Add the supported versions and required test commands to the [`.tav.yml`](.tav.yml) file
1. Add the name of the module to one of the TAV groups in [`.ci/tav.json`](.ci/tav.json) for all Node.js versions.
   To better balance the work requried to run each TAV group,
   pick the TAV group that is currently running the fastest.


## Releasing

At a given time there may be one or more active git branches:
- the `main` branch is used for releases of the current major, and
- there may be zero or more maintenance branches for past major versions.

See the [Active release branches](https://github.com/elastic/apm-agent-nodejs#active-release-branches)
section in the main README.

A release involves the following published artifacts:

- **npm**: A new release to <https://www.npmjs.com/package/elastic-apm-node>.
  If the release is for the current major version, the "latest" npm dist-tag is applied.
  Maintenance releases use a "latest-<major>" npm dist-tag, e.g. "latest-2".
- **docker image**: A new "docker.elastic.co/observability/apm-agent-nodejs:<version>"
  Docker image is published. If the release is for the current major, then the
  "latest" Docker tag is also applied.
- **AWS Lambda layers**: A new AWS Lambda layer for the APM agent is published
  in each AWS region. For example, "arn:aws:lambda:us-east-1:267093732750:layer:elastic-apm-node-ver-3-49-1:1"
  for the 3.49.1 version in the us-east-1 AWS region.
- **GitHub release**: A new release entry is added to <https://github.com/elastic/apm-agent-nodejs/releases/>.
  If the release is for the current major version, the "latest" tag is applied.


### Release process

1. Make a PR titled "x.y.z" (the new version) targetting the appropriate active
   branch, which updates:
    - the version in `package.json`,
    - the version in `package-lock.json` (by running `npm install`),
    - all cases of "REPLACEME" in docs and comments,
    - "CHANGELOG.asciidoc": Add missing changelog entries, if any. Then change
      the "Unreleased" section title to:
        ```
        [[release-notes-x.y.z]]
        ==== x.y.z - YYYY/MM/DD
        ```
   If there are particular highlights for the release, then it can be helpful
   to point those out in the PR description.
2. Get your PR reviewed, ensure PR checks pass, then merge.
3. Working on the elastic repo now (not a fork), tag the merged commit with:
   `git tag vx.y.x && git push origin vx.y.z`.
   For example: `git tag v1.2.3 && git push origin v1.2.3`.
   (The GitHub Actions CI "release" workflow will handle all the release
   steps -- including the `npm publish`. See the appropriate run at:
   https://github.com/elastic/apm-agent-nodejs/actions/workflows/release.yml)
4. If this is the for the latest major (currently `3.x`), then reset the latest
   major branch to point to the current main, e.g.:
   `git branch -f 3.x main && git push origin 3.x`
   (The periodic [docs CI job](https://elasticsearch-ci.elastic.co/view/Docs/job/elastic+docs+master+build/)
   uses this branch to update the [published docs](https://www.elastic.co/guide/en/apm/agent/nodejs/current/release-notes-3.x.html).)

If this is a new major release, then:

- [Create an issue](https://github.com/elastic/website-requests/issues/new) to request an update of the [EOL table](https://www.elastic.co/support/eol).
- Update the "Active release branches" section of the main README.
- Update the "release.yml" for the new "N.x" *maintenance* branch as follows:
    - The `npm publish ...` call must include a `--tag=latest-<major>` option.
    - The `gh release create ...` call must include a `--latest=false` option.
