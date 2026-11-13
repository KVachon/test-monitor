# KurTest in a container, for an always-on server (a Linux box, a NAS).
#   docker run -d --name kurtest -p 7357:7357 -v kurtest:/data ghcr.io/kvachon/kurtest
#   docker exec kurtest kurtest token      (the token senders need, and a sign-in link)
FROM node:22-alpine
WORKDIR /app
COPY package.json LICENSE ./
COPY bin bin
COPY lib lib
COPY page page
COPY reporters reporters
COPY docs/claude-code.md docs/
RUN npm install -g --omit=dev . && mkdir -p /data && chown node:node /data
USER node
ENV KURTEST_DATA=/data KURTEST_HOST=0.0.0.0
VOLUME /data
EXPOSE 7357
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:7357/healthz || exit 1
CMD ["kurtest", "serve"]
