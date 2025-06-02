# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:8a1f59ffb675680d47db6337b49d22281a139e9d709335b492be023728e11715
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
