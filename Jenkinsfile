pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '30'))
        timestamps()
    }

    parameters {
        string(
            name: 'STORAGENT_API_SERVERS',
            defaultValue: 'http://10.41.102.223:6783,http://10.32.129.241:6783,http://10.17.158.115:6783,http://10.8.136.107:6783,http://10.31.133.207:6783',
            description: 'Backend candidate URLs as a JSON array or comma-separated list'
        )
    }

    environment {
        HARBOR_REGISTRY = '10.17.158.118'
        IMAGE_REPOSITORY = '10.17.158.118/storagent/storagent_frontend'
        // Registry token requests must use the proxied Docker daemon network path.
        BUILDKIT_NO_CLIENT_TOKEN = 'true'
        NO_PROXY = 'localhost,127.0.0.1,::1,10.17.158.118,10.17.158.156,10.41.102.223,10.32.129.241,10.17.158.115,10.8.136.107,10.31.133.207'
    }

    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
                script {
                    def revision = sh(
                        script: 'git rev-parse HEAD',
                        returnStdout: true
                    ).trim().toLowerCase()

                    if (!(revision ==~ /[0-9a-f]{40,64}/)) {
                        error('Unable to determine a valid Git revision')
                    }
                    def apiServers = params.STORAGENT_API_SERVERS?.trim()
                    if (!apiServers) {
                        error('STORAGENT_API_SERVERS must not be empty')
                    }

                    env.STORAGENT_API_SERVERS = apiServers
                    env.FRONTEND_GIT_COMMIT = revision
                    env.IMAGE_TAG = "sha-${revision.take(12)}"
                    env.IMAGE_REF = "${env.IMAGE_REPOSITORY}:${env.IMAGE_TAG}"
                    env.CI_IMAGE_REF = "storagent_frontend-ci:${env.BUILD_NUMBER}-${revision.take(12)}"
                    currentBuild.displayName = env.IMAGE_TAG
                }
            }
        }

        stage('Select Build Proxy') {
            steps {
                sh(label: 'Probe package registries through available proxies', script: '''#!/usr/bin/env bash
set -euo pipefail

mapfile -t targets < <(
  grep -Eho 'https?://[^"[:space:]]+' storage-agent/package.json storage-agent/package-lock.json 2>/dev/null |
  sed 's/[),;].*$//' | sort -u | head -6
)
[ "${#targets[@]}" -gt 0 ] || { echo 'No package registry URLs found' >&2; exit 1; }

mapfile -t candidates < <(
  for file in /opt/set_proxy_*.sh; do
    grep -Eho 'https?://[[:alnum:].:-]+:[0-9]+' "$file" 2>/dev/null || true
  done | sort -u
)
candidates+=(DIRECT)

probe() {
  local proxy="$1" target="$2" code
  if [ "$proxy" = DIRECT ]; then
    code=$(env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy curl --noproxy '*' -sS -L --connect-timeout 3 --max-time 8 -o /dev/null -w '%{http_code}' "$target" 2>/dev/null || true)
  else
    code=$(env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy curl --proxy "$proxy" -sS -L --connect-timeout 3 --max-time 8 -o /dev/null -w '%{http_code}' "$target" 2>/dev/null || true)
  fi
  [[ "$code" =~ ^[234][0-9][0-9]$ ]]
}

best=''
best_elapsed=999999
for proxy in "${candidates[@]}"; do
  started=$SECONDS
  passed=0
  for target in "${targets[@]}"; do
    probe "$proxy" "$target" && passed=$((passed + 1)) || true
  done
  elapsed=$((SECONDS - started))
  echo "Proxy $proxy: $passed/${#targets[@]} targets passed in $elapsed s"
  if [ "$passed" -eq "${#targets[@]}" ] && [ "$elapsed" -lt "$best_elapsed" ]; then
    best="$proxy"
    best_elapsed="$elapsed"
  fi
done

[ -n "$best" ] || { echo 'No proxy passed all package registry probes' >&2; exit 1; }
if [ "$best" = DIRECT ]; then
  printf 'export HTTP_PROXY=\nexport HTTPS_PROXY=\nexport http_proxy=\nexport https_proxy=\n' > .selected-build-proxy.env
else
  printf 'export HTTP_PROXY=%q\nexport HTTPS_PROXY=%q\nexport http_proxy=%q\nexport https_proxy=%q\n' "$best" "$best" "$best" "$best" > .selected-build-proxy.env
fi
echo "Selected build proxy: $best"
''')
            }
        }

        stage('Frontend CI') {
            steps {
                sh(label: 'Run frontend CI in Node 22', script: '''#!/usr/bin/env bash
set -euo pipefail

. ./.selected-build-proxy.env

docker build \
  --target build \
  --build-arg HTTP_PROXY \
  --build-arg HTTPS_PROXY \
  --build-arg NO_PROXY \
  --build-arg STORAGENT_API_SERVERS \
  --tag "${CI_IMAGE_REF}" \
  .
''')
            }
        }

        stage('Build Production Image') {
            when {
                expression { env.BRANCH_NAME == 'master' }
            }
            steps {
                sh(label: 'Build frontend runtime image', script: '''#!/usr/bin/env bash
set -euo pipefail

. ./.selected-build-proxy.env

docker build \
  --provenance=false \
  --platform linux/amd64 \
  --build-arg HTTP_PROXY \
  --build-arg HTTPS_PROXY \
  --build-arg NO_PROXY \
  --build-arg STORAGENT_API_SERVERS \
  --build-arg "VCS_REF=${FRONTEND_GIT_COMMIT}" \
  --tag "${IMAGE_REF}" \
  .

test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.component" }}' "${IMAGE_REF}")" = "frontend"
test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${IMAGE_REF}")" = "${FRONTEND_GIT_COMMIT}"
''')
            }
        }

        stage('Push Image') {
            when {
                expression { env.BRANCH_NAME == 'master' }
            }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'infra_harbor_auth',
                        usernameVariable: 'HARBOR_USERNAME',
                        passwordVariable: 'HARBOR_PASSWORD'
                    )
                ]) {
                    sh(label: 'Push immutable image', script: '''#!/usr/bin/env bash
set -euo pipefail
set +x

DOCKER_CONFIG="$(mktemp -d "${WORKSPACE}/.docker-frontend.XXXXXX")"
export DOCKER_CONFIG
chmod 700 "${DOCKER_CONFIG}"
cleanup_registry_session() {
  docker logout "${HARBOR_REGISTRY}" >/dev/null 2>&1 || true
}
trap cleanup_registry_session EXIT

printf '%s' "${HARBOR_PASSWORD}" | docker login "${HARBOR_REGISTRY}" --username "${HARBOR_USERNAME}" --password-stdin
docker push "${IMAGE_REF}" 2>&1 | tee docker-push.log
awk '/digest: sha256:/{for (i = 1; i <= NF; i++) if ($i ~ /^sha256:/) {print $i; exit}}' docker-push.log > frontend-image.digest
test -s frontend-image.digest
''')
                }

                script {
                    env.IMAGE_DIGEST = readFile('frontend-image.digest').trim()
                    if (!(env.IMAGE_DIGEST ==~ /sha256:[0-9a-f]{64}/)) {
                        error('Harbor push did not return a valid image digest')
                    }
                }
            }
        }

        stage('Publish Metadata') {
            when {
                expression { env.BRANCH_NAME == 'master' }
            }
            steps {
                script {
                    def digestRef = "${env.IMAGE_REPOSITORY}@${env.IMAGE_DIGEST}"
                    writeFile(
                        file: 'frontend-image.properties',
                        text: [
                            'COMPONENT=frontend',
                            "IMAGE_REPOSITORY=${env.IMAGE_REPOSITORY}",
                            "IMAGE_TAG=${env.IMAGE_TAG}",
                            "IMAGE_DIGEST=${env.IMAGE_DIGEST}",
                            "IMAGE_REF=${env.IMAGE_REF}",
                            "IMAGE_DIGEST_REF=${digestRef}",
                            "GIT_COMMIT=${env.FRONTEND_GIT_COMMIT}"
                        ].join('\n') + '\n'
                    )

                    def metadata = [
                        component: 'frontend',
                        repository: env.IMAGE_REPOSITORY,
                        tag: env.IMAGE_TAG,
                        digest: env.IMAGE_DIGEST,
                        imageRef: env.IMAGE_REF,
                        digestRef: digestRef,
                        gitCommit: env.FRONTEND_GIT_COMMIT,
                        buildNumber: env.BUILD_NUMBER,
                        buildUrl: env.BUILD_URL ?: ''
                    ]
                    writeFile(
                        file: 'frontend-image.json',
                        text: groovy.json.JsonOutput.prettyPrint(
                            groovy.json.JsonOutput.toJson(metadata)
                        ) + '\n'
                    )

                    archiveArtifacts(
                        artifacts: 'frontend-image.properties,frontend-image.json',
                        fingerprint: true,
                        onlyIfSuccessful: true
                    )
                }
            }
        }
    }

    post {
        always {
            script {
                if (env.IMAGE_REF?.trim()) {
                    sh(
                        label: 'Remove local image',
                        returnStatus: true,
                        script: 'docker image rm "${IMAGE_REF}" >/dev/null 2>&1'
                    )
                }
                if (env.CI_IMAGE_REF?.trim()) {
                    sh(
                        label: 'Remove local CI image',
                        returnStatus: true,
                        script: 'docker image rm "${CI_IMAGE_REF}" >/dev/null 2>&1'
                    )
                }
            }
            deleteDir()
        }
    }
}
