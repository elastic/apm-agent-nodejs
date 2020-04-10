# -*- coding: utf-8 -*-

import os
import re
import git
import github
import datetime
import pytest
import generate_cc_changelog.generate  # noqa

"""
Principally, this is a collection of lightweight smoke tests.
If bugs or regressions are discovered, those cases should be added
to this suite.
"""


def test_gather_commits():
    this_path = os.path.dirname(os.path.realpath(__file__))
    root_path = os.path.join(this_path, "../../../..")
    shas = generate_cc_changelog.generate.gather_commits(root_path)
    test_sha = shas.pop()
    assert re.match("[a-z0-9]", str(test_sha)) is not None


def test_sha_of_last_tag():
    this_path = os.path.dirname(os.path.realpath(__file__))
    root_path = os.path.join(this_path, "../../../..")
    tag_sha = generate_cc_changelog.generate.sha_of_last_tag(root_path)
    assert re.match("[a-z0-9]", str(tag_sha)) is not None


def test_extract_releases():
    this_path = os.path.dirname(os.path.realpath(__file__))
    template_path = os.path.join(this_path, "../../../../CHANGELOG.asciidoc")
    extraction = generate_cc_changelog.generate.extract_releases(template_path)
    assert extraction[-1][-1] == '\n'


def test_is_changelog_worthy():
    test_commit = git.Commit
    test_commit.message = "fix:"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is True


def test_is_changelog_worthy_with_description():
    test_commit = git.Commit
    test_commit.message = "fix(foo):"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is True


def test_is_changelog_worthy_with_bang():
    test_commit = git.Commit
    test_commit.message = "outlier(unknown)!"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is True


def test_is_changelog_worthy_with_bang_no_scope():
    test_commit = git.Commit
    test_commit.message = "outlier!"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is True


def test_is_not_changelog_worthy():
    test_commit = git.Commit
    test_commit.message = "outlier(unknown)"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is False


def test_is_not_changelog_worthy_no_scope():
    test_commit = git.Commit
    test_commit.message = "outlier"
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is False


def test_body_is_not_changelog_worthy():
    test_commit = git.Commit
    test_commit.message = \
        """
        Lorem ipsum dolor sit amet, consectetur adipiscing elit,
        sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
        nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
        reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
        pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
        culpa qui officia deserunt mollit anim id est laborum.
        """
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is False


def test_body_is_changelog_worthy():
    test_commit = git.Commit
    test_commit.message = \
        """
        Lorem ipsum dolor sit amet, consectetur adipiscing elit,
        sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
        nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
        reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
        pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
        BREAKING CHANGE
        culpa qui officia deserunt mollit anim id est laborum.
        """
    worthiness = generate_cc_changelog.generate.is_changelog_worthy(
        test_commit)
    assert worthiness is True


def test_generate_changelog():
    test_release_entry = [(
        '[[release-notes-9.9.9]]\n'
        '==== 9.9.9 - 2020-04-15\n'
        '\n'
        '* fix(package): bump stackman to ^4.0.1\n'
        '\n')]
    expected_ret = """ifdef::env-github[]
NOTE: Release notes are best read in our documentation at
https://www.elastic.co/guide/en/apm/agent/nodejs/current/release-notes.html[elastic.co]
endif::[]

[[release-notes-9.9.9]]
==== 9.9.9 - 2020-04-15

* fix(package): bump stackman to ^4.0.1


"""
    env = generate_cc_changelog.generate.jinja_env()
    ret = generate_cc_changelog.generate.generate_changelog(
        env,
        test_release_entry)
    assert ret == expected_ret


def test_generate_release_entry_for_pr_strategy():
    release_number = "9.9.9"
    env = generate_cc_changelog.generate.jinja_env()

    first_pr = github.PullRequest.PullRequest(
        requester=None,
        headers=None,
        attributes={"title": "First PR"},
        completed=True)

    second_pr = github.PullRequest.PullRequest(
        requester=None,
        headers=None,
        attributes={"title": "Second PR"},
        completed=True)

    prs = [first_pr, second_pr]

    ret = generate_cc_changelog.generate.generate_release_entry_from_prs(
        env,
        prs,
        release_number)

    expected_ret = """[[release-notes-9.9.9]]
==== 9.9.9 - {today}

* First PR
* Second PR

""".format(today=datetime.datetime.today().strftime('%Y-%m-%d'))
    assert ret == expected_ret


@pytest.mark.skip(
    reason="There is an upstream bug with pygit when setting the message attr")
def test_generate_release_entry_for_git_strategy():
    release_number = "9.9.9"
    env = generate_cc_changelog.generate.jinja_env()

    first_commit = git.Commit(
        repo=None,
        binsha=b'00000000000000000000',
        message="First commit")
    # first_commit.message = "First commit"

    second_commit = git.Commit(
        repo=None,
        binsha=b'00000000000000000000',
        message="Second commit")
    # second_commit.message = "Second commit"

    commits = [first_commit, second_commit]

    ret = generate_cc_changelog.generate.generate_release_entry_from_commits(
        env,
        commits,
        release_number
    )

    expected_ret = """[[release-notes-9.9.9]]
==== 9.9.9 - {today}

* First commit
* Second commit

""".format(today=datetime.datetime.today().strftime('%Y-%m-%d'))
    assert ret == expected_ret


def test_reconstitute_release_entry():
    fake_entry = ["first line\n", "second line\n", "third line\n"]
    expected_ret = """first line
second line
third line
"""
    ret = generate_cc_changelog.generate.reconstitute_release_entry(fake_entry)
    assert ret == expected_ret
