# Storagent Host Gateway

Each regional host resolves `stor.1oa.com.cn` to itself. The host Nginx service
is the only listener on the public HTTP port. It serves the frontend through the
loopback-only Docker publication at `127.0.0.1:8080` and proxies backend paths:

| Browser path | Target |
| --- | --- |
| `/` | local Docker frontend |
| `/server/local/` | backend on this host (`127.0.0.1:6783`) |
| `/server/bj/` | Beijing backend |
| `/server/tj/` | Tianjin backend |
| `/server/ks/` | Kunshan backend |
| `/server/sz/` | Shenzhen backend |
| `/server/hz/` | Hangzhou backend |

`proxy_pass` routes include a trailing slash, so Nginx removes the selected
`/server/{region}/` prefix before forwarding the backend request.

## Deployment package

Build the frontend image with the same-origin API candidates, export it as
`/tmp/storagent-frontend-gateway.tar.gz`, and copy this directory's two Nginx
configuration files plus `deploy-gateway.sh` to `/tmp` on the target host. Run
the script as root. It saves the prior container metadata and Nginx directory in
`/opt/storagent-gateway/backups`, preserves the former frontend container under
`storagent-frontend-legacy-20260808`, and rolls back automatically if the new
frontend or Nginx health checks fail.
