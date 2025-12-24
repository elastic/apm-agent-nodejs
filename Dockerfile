# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:865b95f46d98cf867a156fe4a135ad3fe50d2056aa3f25ed31662dff6da4eb62
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
