# Contributing to the APM Agent

The APM Agent is open source and we love to receive contributions from our community — you!

There are many ways to contribute,
from writing tutorials or blog posts,
improving the documentation,
submitting bug reports and feature requests or writing code.

You can get in touch with us through [Discuss](https://discuss.elastic.co/c/apm),
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
    and rebase your branch on top of the latest master branch.
    We prefer your initial changes to be squashed into a single commit.
    Later, if we ask you to make changes, add them as separate commits.
    This makes them easier to review.

4. Submit a pull request

    Push your local changes to your forked copy of the repository and [submit a pull request](https://help.github.com/articles/using-pull-requests).
    In the pull request,
    choose a title which sums up the changes that you have made,
    and in the body provide more details about what your changes do.
    Also mention the number of the issue where discussion has taken place,
    e.g. "Closes #123".

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

1. The first line should contain **a short description* of the change.**
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


### Testing

For information about how to run the test suite,
see [TESTING.md](TESTING.md).


### Backporting

If a PR is marked with a `backport:*` label,
it should be backported to the branch specified by the label after it has been merged.

To backport a commit,
run the following command and follow the instructions in the terminal:

```
npm run backport
```

### Workflow

All feature development and most bug fixes hit the master branch first.
Pull requests should be reviewed by someone with commit access.
Once approved, the author of the pull request,
or reviewer if the author does not have commit access,
should "Squash and merge".

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
1. Add the name of the module to one of the TAV groups in both [`.travis.yml`](.travis.yml) and [`test/.jenkins_tav.yml`](test/.jenkins_tav.yml) for all Node.js versions.
   To better balance the work requried to run each TAV group,
   pick the TAV group that is currently running the fastest.
   Look at the "Dependencies" stage of one of our latest [Travis cron job builds](https://travis-ci.org/elastic/apm-agent-nodejs/builds) for an overview

### Releasing

If you have access to make releases, the process is as follows:

#### Current major

1. Be sure you have checked out the `master` branch and have pulled latest changes
1. Update the version in `package.json` according to the scale of the change. (major, minor or patch)
1. Update `CHANGELOG.asciidoc`:
    - Change the "Unreleased" section title to:
        ```
        [[release-notes-x.x.x]]
        ==== x.x.x - YYYY/MM/DD
        ```
    - Add missing changelog entries, if any. (Typically commits will include changelog entries in the "Unreleased" section.)
1. If a major or minor release, update the EOL table in `docs/upgrading.asciidoc`. EOL is 18 months after release date.
1. Commit changes with message `x.y.z` where `x.y.z` is the version in `package.json`
1. Tag the commit with `git tag vx.y.x`, for example `git tag v1.2.3`
1. Reset the latest major branch (currently `3.x`) to point to the current master, e.g. `git branch -f 3.x master`
1. Run tests with `npm test`
1. Push commits and tags upstream with `git push upstream master && git push upstream --tags` (and optionally to your own fork as well)
1. Update the latest major branch on upstream with `git push upstream <major_branch>`
1. Publish to npm with `npm publish`

#### Past major

1. Be sure you have checked out the branch associated with the major you wish to release and have pulled latest changes, e.g. `2.x`
1. Update the version in `package.json` according to the scale of the change. (major, minor or patch)
1. Update `CHANGELOG.asciidoc`:
    - Change the "Unreleased" section title to:
        ```
        [[release-notes-x.x.x]]
        ==== x.x.x - YYYY/MM/DD
        ```
    - Add missing changelog entries, if any. (Typically commits will include changelog entries in the "Unreleased" section.)
1. Commit changes with message `x.y.z` where `x.y.z` is the version in `package.json`
1. Tag the commit with `git tag vx.y.x`, for example `git tag v1.2.3`
1. Run tests with `npm test`
1. Push commits and tags upstream with `git push upstream <major_branch> && git push upstream --tags` (and optionally to your own fork as well)
1. Publish to npm with `npm publish --tag=2x` (where `2x` is the tag for the past major version being published)
1. Make a PR against `master` containing the updates to `CHANGELOG.asciidoc` so that `master` always contain information about all releases
