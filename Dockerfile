# Pin to Alpine 3.21.3
# platform: linux; amd64
# ref: https://github.com/docker-library/repo-info/blob/1d18c8623bddaa866457a10b9eefa3a5be06242e/repos/alpine/remote/3.21.3.md?plain=1#L26
#
# For a complete list of hashes, see:
# https://github.com/docker-library/repo-info/tree/master/repos/alpine/remote
FROM alpine@sha256:1c4eef651f65e2f7daee7ee785882ac164b02b78fb74503052a26dc061c90474
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
