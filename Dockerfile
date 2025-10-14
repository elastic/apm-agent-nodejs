# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
