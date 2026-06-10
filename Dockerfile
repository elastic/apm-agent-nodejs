# Pin the latest Alpine 3
# https://github.com/docker-library/repo-info/blob/master/repos/alpine/remote/3.md

FROM alpine@sha256:fa1b3b8cd12d2b2ded5ef366f99b5a7556884646af680404989d626535a3ac14
ARG AGENT_DIR
COPY ${AGENT_DIR} /opt/nodejs
