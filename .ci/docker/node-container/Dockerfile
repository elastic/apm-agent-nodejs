ARG NODE_VERSION=8
FROM node:${NODE_VERSION}
#COPY fix-docker-image.sh /
#RUN chmod ugo+rx /fix-docker-image.sh && /fix-docker-image.sh
RUN id && npm install -g yarn && yarn global upgrade npm@latest
#RUN npm install -g npm@latest

RUN node --version && npm --version

WORKDIR /app
