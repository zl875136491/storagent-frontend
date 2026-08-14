FROM node:22-alpine AS build

WORKDIR /app/storage-agent

COPY storage-agent/package.json storage-agent/package-lock.json ./
RUN npm ci

COPY storage-agent/ ./

ARG STORAGENT_API_SERVERS=/server/local,/server/bj,/server/tj,/server/ks,/server/sz,/server/hz
ENV STORAGENT_API_SERVERS=${STORAGENT_API_SERVERS}
ARG VITE_STORAGENT_ENV=production
ENV VITE_STORAGENT_ENV=${VITE_STORAGENT_ENV}

RUN npm run ci

FROM nginx:1.28-alpine AS runtime

ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Storagent Frontend" \
      org.opencontainers.image.component="frontend" \
      org.opencontainers.image.revision="${VCS_REF}"

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/storage-agent/dist/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
