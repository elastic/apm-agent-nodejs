#!/usr/bin/env bash
set -exo pipefail

# Prepare the git workspace for the release in the CI
# This is caused by the detached default repository.
#
# Some environment variables are required to be exposed beforehand:
# - GITHUB_USER, the GitHub user account. This is set on the fly with some credentials.
# - GITHUB_TOKEN , the GitHub api token. This is set on the fly with some credentials.
# - ORG_NAME, the GitHub organisation. This is set on the fly when using the gitCheckout step.
# - REPO_NAME, the GitHub repo. This is set on the fly when using the gitCheckout step.
# - GIT_BASE_COMMIT, the sha commit. This is set on the fly when using the gitCheckout step.
# - BRANCH_NAME, the branch name. This is set on the fly when using the Multibranch Pipeline.
#

# Enable git+https. Env variables are created on the fly with the gitCheckout
git config remote.origin.url "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${ORG_NAME}/${REPO_NAME}.git"

# Enable to fetch branches when cloning with a detached and shallow clone
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'

# Force the git user details when pushing using the last commit details
USER_MAIL=$(git log -1 --pretty=format:'%ae')
USER_NAME=$(git log -1 --pretty=format:'%an')
git config user.email "${USER_MAIL}"
git config user.name "${USER_NAME}"

# Checkout the branch as it's detached based by default.
# See https://issues.jenkins-ci.org/browse/JENKINS-33171
git fetch --all
git checkout "${BRANCH_NAME}"

# Ensure the branch points to the original commit to avoid commit injection
# when running the release pipeline.
# used GIT_BASE_COMMIT instead GIT_COMMIT to support the MultiBranchPipelines.
git reset --hard "${GIT_BASE_COMMIT}"

# Enable upstream with git+https.
git remote add upstream "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${ORG_NAME}/${REPO_NAME}.git"
git fetch upstream
