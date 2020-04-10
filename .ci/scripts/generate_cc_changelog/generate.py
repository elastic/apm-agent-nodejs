#!/usr/bin/env python

import re
import os
import sys
import git
import github
import jinja2
import argparse
import datetime


def parse_args():
    parser = argparse.ArgumentParser(description='Produce a CHANGELOG from a \
        repository adhering to Conventional Commits standards')

    parser.add_argument("--repo",
                        help="GitHub repo to analyze",
                        required=True)

    parser.add_argument("--token",
                        help="The GitHub token to use. Only pass this with "
                        "the `pr` strategy option",
                        required=False)

    parser.add_argument("--strategy",
                        help="The strategy to use when calculating commits to "
                        "include",
                        choices=["git", "prs"],
                        required=False,
                        default="git")

    parser.add_argument("--release",
                        help="Release number to generate. e.g.: 3.6.0",
                        required=True)

    parser.add_argument("--tree",
                        help="The working tree of the repo to produce the \
                            changelog for.",
                        required=False)

    parser.add_argument("--preview",
                        help="Just show the new entries which are to be added",
                        default=False,
                        required=False)

    parser.add_argument("--changelog",
                        help="The CHANGELOG file to examine",
                        default="CHANGELOG.asciidoc",
                        required=False)

    parsed = parser.parse_args()

    # Pre-flight the options because we can't do mutual exclusivitey on values
    # natively with argparse

    if parsed.strategy == "git" and hasattr(parser, "token"):
        print("Error: Cannot specify --token and --strategy git. Did you mean "
              "to use --strategy prs ?")
        sys.exit(1)

    return parsed


def github_connect(token):
    """
    Connect to GitHub with the given token and return a connection

    Parameters
    ----------
    token : str, required
        The GitHub token to use to authenticate to GitHub. See this
        page for more details on creating and using a GitHub token:
        https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line


    Returns
    -------
    github.Github
        A GitHub object which can be used to interact with a GitHub repo. See
        this page for more details about use of this object:
        https://pygithub.readthedocs.io/en/latest/introduction.html
    """
    return github.Github(token)


def gather_prs(github_conn, repo, commits):
    """
    Return a list of all GitHub pull requests for a list of SHAs

    Parameters
    ----------
    github_conn : github.Github, required
        A GitHub object as described here:
        https://pygithub.readthedocs.io/en/latest/introduction.html

    repo : str, required
        The repo to examine. e.g. "elastic/apm-agent/node-js"

    commits : list, required
        A list of commits to gather PRs for. Each commit should be
        of a git.Commit type.

    Returns
    -------
    list
        A list of pull requests. Each element of the list is a pull request
        object as described here:
        https://pygithub.readthedocs.io/en/latest/github_objects/PullRequest.html
    """
    ret = list()
    repo = github_conn.get_repo(repo)
    for commit in commits:
        commit_pulls = repo.get_commit(str(commit)).get_pulls()
        for pull in commit_pulls:
            ret.append(pull)
    return ret


def gather_commits(working_tree):
    """
    Discover a set of commits in the history between the first and the last,
    inclusively

    Parameters
    ----------
    working_tree : str, required
        The git repo to examine. Must pass in root of repo.

    Returns
    -------
    list
        A list of commits. Each commit is a git.Commit type.
    """
    ret = list()
    repo = git.Repo(working_tree)
    latest_tag = repo.tags.pop()
    for commit in repo.iter_commits(rev="{tag}..HEAD".format(tag=latest_tag)):
        ret.append(commit)
    return ret


def sha_of_last_tag(working_tree):
    """
    Return the SHA of the previous tag

    Parameters
    ----------
    working_tree : str, required
        The git repo to examine. Must pass in root of repo.

    Returns
    -------
    git.Commit
        The most recent commit. Must wrap in str() to eval as a
        a string.
    """
    repo = git.Repo(working_tree)
    assert not repo.bare
    latest_tag = repo.tags.pop()
    return latest_tag.commit


def extract_releases(changelog_path):
    """
    Take an existing changelog and return a list of changelog entries

    Parameters
    ----------
    changelog_path : str, required
        The path of the CHANGELOG.asciidoc file to examine

    Returns
    -------
    list
        A list of changelog entries. Each element in the list is a list
        which contains all the plain-text lines from that entry, complete
        with newlines.
    """
    release_blocks = list()
    fh_ = open(changelog_path, "r")
    release_block = list()
    release_section_found = False
    for line in fh_:
        if re.match(r"\[\[release-notes-", line):  # noqa: W605
            # We found a release note block, if we had a release block already,
            # go ahead and record it.
            if release_block:
                release_blocks.append(release_block)
            # Now clear out the release block.
            release_block = list()
            # Add this first line of the block to the block container
            release_block.append(line)
            # We are in the release section so go ahead and set the flag to
            # continue collection
            release_section_found = True
        elif release_section_found:
            release_block.append(line)

    return release_blocks


def is_changelog_worthy(commit):
    """
    Take a commit and return a boolean indicating whether or not the commit
    should be included in a changelog

    Parameters
    ----------
    commit : git.Commit

    Returns
    -------
    bool
        True if the pull request is one that we consider as being appropriate
        for the changelog. See the implementation for details on how this
        selection process operates.
    """
    # Match all (fix|feat|perf) as well as any title with !
    if re.match(r"fix(\(.*\)){0,1}:|"
                r"feat(\(.*\)){0,1}:|"
                r"perf(\(.*\)){0,1}:|"
                r"\w+(\(.*\)){0,1}!", commit.message) or \
            re.search(r"BREAKING CHANGE", commit.message):
        return True
    else:
        return False


def jinja_env():
    """
    Supplies a functional Jinja environment

    Returns
    -------
    jinja2.Environment
        An initialized Jinja2 environment. For more information, please see the
        Jinja documentation: https://jinja.palletsprojects.com/en/2.11.x/
    """
    script_path = os.path.dirname(os.path.realpath(__file__))
    template_path = os.path.join(script_path, "templates")
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(
            template_path),
        autoescape=jinja2.select_autoescape(['html', 'xml'])
    )


def generate_changelog(env, entries):
    """
    Generates a full changelog using the changelog.jinja2 template

    Parameters
    ----------
    env : jinja2.Environment
        A fully initialized Jinja2 environment. For more information, please
        see the Jinja documentation:
        https://jinja.palletsprojects.com/en/2.11.x/

    entries : list
        A list of release entries. Each release entry should be a string
        with embedded newlines.

    Returns
    -------
    str
        A full CHANGELOG document
    """
    template = env.get_template("changelog.jinja2")
    return template.render(releases=entries)


def generate_release_entry_from_prs(env, prs_for_release, release_number):
    """
    Generate a block of changelog text for a set of PRs

    Parameters
    ----------
    env : jinja2.Environment
        A fully initialized Jinja2 environment. For more information, please
        see the Jinja documentation:
        https://jinja.palletsprojects.com/en/2.11.x/

    prs_for_release : list
        A list of pull requests, which each element in the list is a
        PullRequest object as described here:
            https://pygithub.readthedocs.io/en/latest/github_objects/PullRequest.html

    release_number : str
        A release number representing the release. e.g. `0.0.1`.
    """
    template = env.get_template("pr_entry.jinja2")
    return template.render(release_number=release_number,
                           prs=prs_for_release,
                           today=datetime.datetime.today().strftime('%Y-%m-%d')
                           )


def generate_release_entry_from_commits(env, commits, release_number):
    """
    Generate a block fo changelog text for a set of commits

    Parameters
    ----------
    env : jinja2.Environment
        A fully initialized Jinja2 environment. For more information, please
        see the Jinja documentation:
        https://jinja.palletsprojects.com/en/2.11.x/

    commits : list
    A list of commits, where each element in the list is a
    git.objects.commit.Commit as described here:
        https://gitpython.readthedocs.io/en/stable/reference.html#module-git.objects.commit

    release_number : str
        A release number representing the release. e.g. `0.0.1`.
    """
    template = env.get_template("git_entry.jinja2")
    return template.render(release_number=release_number,
                           commits=commits,
                           today=datetime.datetime.today().strftime('%Y-%m-%d')
                           )


def reconstitute_release_entry(entry):
    """
    Take a release entry which has been split by string into a list
    and reconsitute it back into a single string with newlines.

    Parameters
    ----------
    entry : list
        A list of lines constituting the changelog entry

    Returns
    -------
    str
        A changelog entry as a single string.
    """
    empty_str = ""
    ret = empty_str.join(entry)
    return ret


def entrypoint():
    # Gather arguments from the command-line
    args = parse_args()

    # Prepare a Jinja environment for use in building the resulting
    # CHANGELOG output.
    env = jinja_env()

    # Examine the existing CHANGELOG and break it a list of releases.
    #
    # Each element in the list of releases is a list of lines for that
    # entry.
    extracted_changelog_parts = extract_releases(args.changelog)

    # Examine the local git history to retrieve a list of SHAs which
    # are present in the history between the last tag and the HEAD
    # of the branch.
    commits = gather_commits(args.tree)

    # We need to filter the commits to just the ones we are interested in
    filtered_commits = filter(is_changelog_worthy, commits)

    if args.strategy == "prs":
        # Prepare a connection to GitHub in order to gather pull request
        # information
        github_connection = github_connect(args.token)

        # Provide the list of SHAs to GitHub and determine the list of PRs
        # which correspond with them.
        prs = gather_prs(github_connection, args.repo, filtered_commits)

        # Given the list of filtered PRs, generate a new entry for this release
        # which can be inserted into the CHANGELOG.
        new_release_entry = generate_release_entry_from_prs(
            env,
            prs,
            args.release)
    elif args.strategy == "git":
        new_release_entry = generate_release_entry_from_commits(
            env,
            list(filtered_commits),
            args.release
        )
    else:
        print("Unsupported strategy found. "
              "See --help for supported strategies.")
        sys.exit(1)

    # Take the previously extracted release entries and reconstitute them back
    # into release blocks.
    parts = map(reconstitute_release_entry, extracted_changelog_parts)

    # Generate the full CHANGELOG which is consists of header information
    # which is contained in the Jinja template, along with a merged list
    # of the new entry and the previous entries.
    generated_changelog = generate_changelog(
        env,
        [new_release_entry] + list(parts))

    # If are running in preview-only mode, display the new entries
    if args.preview:
        print(new_release_entry)
    else:
        print(generated_changelog)


if __name__ == "__main__":
    entrypoint()
