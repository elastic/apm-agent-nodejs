# Conventional Commits Changelog Generator

## Description

This is an application which generates a CHANGELOG for GitHub repositories which
adhere to the [Conventional Commits](https://conventionalcommits.org) standard.

It examines commits between the HEAD of the current branch and the most recent git
tag. Using the existing CHANGELOG file, it preserves current entries, and generates
new entries using the same standard.

Its primary use is for fully-automated release processes or continueous deployment
scenarios, though it can be run by hand just as easily.

## Prerequisites

1. This application assumes that a CHANGELOG.asciidoc already exists and is present in the repo.
2. A GitHub token is required. To learn more about generating a GitHub token, [please see their documentation](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line)

## Quickstart

To generate a Docker container that can run the application:

```
docker build . -t changelog_generator
```

To run the containerized application:

```
docker run -t changelog_generator --repo my_github_org/my_repo --token my_gh_token --release 0.1
```

All output will be directed to standard out. If you wish to write to a file, use standard redirection.

## Generating previews

To generate just a preview of the entries which would be added, use the `--preview true` flag.

## Additional options and help

For additional options, run the application with the `--help` flag.

## Contributing

To run the tests, use `pytest`.