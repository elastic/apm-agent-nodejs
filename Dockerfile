# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:4bcff63911fcb4448bd4fdacec207030997caf25e9bea4045fa6c8c44de311d1
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
