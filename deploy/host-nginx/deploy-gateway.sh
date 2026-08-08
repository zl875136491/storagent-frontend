#!/usr/bin/env bash
set -euo pipefail

# Installs the host gateway and moves the frontend off the public port.
# The old container remains stopped under LEGACY_NAME so this script can restore
# the previous, directly published frontend if any health check fails.
readonly FRONTEND_NAME=storagent-frontend
readonly LEGACY_NAME=storagent-frontend-legacy-20260808
readonly FRONTEND_IMAGE=storagent-frontend-nuc:gateway
readonly FRONTEND_PORT=8080
readonly BACKUP_DIR=/opt/storagent-gateway/backups

rollback_frontend() {
  systemctl stop nginx >/dev/null 2>&1 || true
  docker rm -f "${FRONTEND_NAME}" >/dev/null 2>&1 || true
  if docker container inspect "${LEGACY_NAME}" >/dev/null 2>&1; then
    docker rename "${LEGACY_NAME}" "${FRONTEND_NAME}"
    docker start "${FRONTEND_NAME}"
  fi
}

mkdir -p "${BACKUP_DIR}"
docker inspect "${FRONTEND_NAME}" > "${BACKUP_DIR}/frontend-before.json"

if [ -d /etc/nginx ]; then
  tar -C /etc -czf "${BACKUP_DIR}/nginx-before.tar.gz" nginx
fi

# Prefer an optional local package bundle. It lets a regional node whose DNS
# cannot reach an APT mirror still receive the same reviewed Nginx release.
# Without the bundle, package indexes are maintained by normal host operations.
if compgen -G "/tmp/nginx-packages/*.deb" > /dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq /tmp/nginx-packages/*.deb
else
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
fi

install -d -m 0755 /etc/nginx/snippets
install -m 0644 /tmp/storagent.conf /etc/nginx/conf.d/storagent.conf
install -m 0644 /tmp/storagent-proxy.conf /etc/nginx/snippets/storagent-proxy.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t

docker load -i /tmp/storagent-frontend-gateway.tar.gz

if ss -lnt | awk '{print $4}' | grep -qx '127.0.0.1:8080'; then
  echo "127.0.0.1:8080 is already in use" >&2
  exit 1
fi

docker stop "${FRONTEND_NAME}"
docker rename "${FRONTEND_NAME}" "${LEGACY_NAME}"

if ! docker run -d --name "${FRONTEND_NAME}" --restart unless-stopped -p "127.0.0.1:${FRONTEND_PORT}:80" "${FRONTEND_IMAGE}"; then
  docker rename "${LEGACY_NAME}" "${FRONTEND_NAME}"
  docker start "${FRONTEND_NAME}"
  exit 1
fi

for _ in $(seq 1 24); do
  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 2
done

if ! curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/healthz" >/dev/null; then
  rollback_frontend
  exit 1
fi

if ! systemctl enable nginx >/dev/null || ! systemctl restart nginx || ! nginx -t; then
  rollback_frontend
  exit 1
fi

curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/server/local/ready
curl -fsS http://127.0.0.1/server/bj/ready
curl -fsS http://127.0.0.1/server/tj/ready
curl -fsS http://127.0.0.1/ >/dev/null

echo "gateway deployment complete"
