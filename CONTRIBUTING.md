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

1. Sign the Contributor License Agreement

    Please make sure you have signed our [Contributor License Agreement](https://www.elastic.co/contributor-agreement/).
    We are not asking you to assign copyright to us,
    but to give us the right to distribute your code without restriction.
    We ask this of all contributors in order to assure our users of the origin and continuing existence of the code.
    You only need to sign the CLA once.

2. Test your changes

    Run the test suite to make sure that nothing is broken.
    See [testing](#testing) for details.

3. Rebase your changes

    Update your local repository with the most recent code from the main repo,
    and rebase your branch on top of the latest master branch.
    We prefer your initial changes to be squashed into a single commit.
    Later,
    if we ask you to make changes,
    add them as separate commits.
    This makes them easier to review.
    As a final step before merging we will either ask you to squash all commits yourself or we'll do it for you.

4. Submit a pull request

    Push your local changes to your forked copy of the repository and [submit a pull request](https://help.github.com/articles/using-pull-requests).
    In the pull request,
    choose a title which sums up the changes that you have made,
    and in the body provide more details about what your changes do.
    Also mention the number of the issue where discussion has taken place,
    eg "Closes #123".

5. Be patient

    We might not be able to review your code as fast as we would like to,
    but we'll do our best to dedicate it the attention it deserves.
    Your effort is much appreciated!

### Testing

The test suite expects the databases PostgreSQL,
MySQL,
MongoDB,
Elasticsearch and Redis to be present.
The `npm test` command will try and start them all automatically before running the tests.
This should work on macOS if the databases are all installed using [Homebrew](http://brew.sh).

To run the linter without running any tests,
run `npm run lint`.
To automatically fix linting errors run `npm run lint-fix`.

#### Using Docker for Testing

Running the testsuite on _Jenkins_ is based on docker images.
You can also make use of this setup when running tests locally.
Scripts are provided for different stages of testing: testing the documentation,
running tests against different Node.js versions and running tests against different versions of dependencies.
The scripts are tested with a minimum docker version of `17.06.2-ce`.

#### Testing Documentation

```
./test/script/docker/run_docs.sh
```

#### Testing against Node.js versions

```
./test/script/docker/run_tests.sh nodejs-version
```

E.g. `./test/script/docker/run_tests.sh 8`

#### Testing Dependencies

```
./test/script/docker/run_tests.sh nodejs-version dependencies
```

E.g. `./test/script/docker/run_tests.sh 8 redis,pg`

#### Cleanup Docker Container and Volumes

```
./test/script/docker/cleanup.sh
```

### Workflow

All feature development and most bug fixes hit the master branch first.
Pull requests should be reviewed by someone with commit access.
Once approved, the author of the pull request,
or reviewer if the author does not have commit access,
should "Squash and merge".

### Adding support for new modules

The following is an overview of what's required in order to add support to the agent for automatic instrumentation of an npm package.

1. Add the instrumentation logic to a new file in the [`lib/instrumentation/modules`](https://github.com/elastic/apm-agent-nodejs/tree/master/lib/instrumentation/modules) directory named `<package-name>.js`,
   E.g. `mysql.js` for the `mysql` package
1. Add the name of the package to the `MODULES` array in [`lib/instrumentation/index.js`](https://github.com/elastic/apm-agent-nodejs/blob/master/lib/instrumentation/index.js)
1. Add accompanying tests in the [`test/instrumentation/modules`](https://github.com/elastic/apm-agent-nodejs/tree/master/test/instrumentation/modules) directory.
   If you only have one test file,
   place it in the root of the `modules` directory and name it the same as the `lib` file.
   If you have more than one test file,
   create a sub-directory with the name of the package and place all test files inside that
   1. If you created a sub-directory under `test/instrumentation/modules`,
      add it to the `directories` array in [`test/test.js`](https://github.com/elastic/apm-agent-nodejs/blob/master/test/test.js)
1. List the supported versions of the package in [`docs/compatibility.asciidoc`](https://github.com/elastic/apm-agent-nodejs/blob/master/docs/compatibility.asciidoc)
1. We use the [test-all-versions](https://github.com/watson/test-all-versions) module to test the agent against all supported versions of each package we instrument.
   Add the supported versions and required test commands to the [`.tav.yml`](https://github.com/elastic/apm-agent-nodejs/blob/master/.tav.yml) file
1. Add the name of the module to one of the TAV groups in both [`.travis.yml`](https://github.com/elastic/apm-agent-nodejs/blob/master/.travis.yml) and [`test/.jenkins_tav.yml`](https://github.com/elastic/apm-agent-nodejs/blob/master/test/.jenkins_tav.yml) for all Node.js versions.
   To better balance the work requried to run each TAV group,
   pick the TAV group that is currently running the fastest.
   Look at the "Dependencies" stage of one of our latest [Travis cron job builds](https://travis-ci.org/elastic/apm-agent-nodejs/builds) for an overview

### Releasing

If you have access to make releases, the process is as follows:

1. Update the version in `package.json` according to the scale of the change. (major, minor or patch) 
1. Add commit messages to the changelog (You may skip non-user-visible changes)
1. Commit changes with message `x.y.z` where `x.y.z` is the version in `package.json`
1. Tag the commit with `git tag vx.y.x`, for example `git tag v1.2.3`
1. Reset the current major branch (`1.x`, `2.x` etc) to point to the current master, e.g. `git branch -f 1.x master`
1. Run tests with `npm test`
1. Push commits and tags upstream with `git push upstream master && git push upstream --tags` (and optionally to your own fork as well)
1. Update 1.x branch on upstream with `git push upstream 1.x`
1. Publish to npm with `npm publish`
