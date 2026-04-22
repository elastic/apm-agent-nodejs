# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
