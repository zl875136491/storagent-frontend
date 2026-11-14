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
            defaultValue: '/server/local,/server/bj,/server/tj,/server/ks,/server/sz,/server/hz',
            description: 'Same-origin Nginx backend gateway paths as a JSON array or comma-separated list'
        )
    }

    environment {
        HARBOR_REGISTRY = '10.17.158.118'
        IMAGE_REPOSITORY = '10.17.158.118/storagent/storagent_frontend'
        // Registry token requests must use the proxied Docker daemon network path.
        BUILDKIT_NO_CLIENT_TOKEN = 'true'
        // One outbound proxy for npm. Both spellings are set because Docker and
        // npm do not agree on case. Direct hosts stay off the proxy.
        OUTBOUND_PROXY = 'http://proxy.1oa.com.cn:3128'
        DIRECT_HOSTS = 'localhost,127.0.0.1,::1,10.17.158.118,10.17.158.156,10.41.102.223,10.32.129.241,10.17.158.115,10.8.136.107,10.31.133.207,.1oa.com.cn'
        HTTP_PROXY = "${OUTBOUND_PROXY}"
        HTTPS_PROXY = "${OUTBOUND_PROXY}"
        http_proxy = "${OUTBOUND_PROXY}"
        https_proxy = "${OUTBOUND_PROXY}"
        NO_PROXY = "${DIRECT_HOSTS}"
        no_proxy = "${DIRECT_HOSTS}"
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

        stage('Frontend CI') {
            steps {
                sh(label: 'Run frontend CI in Node 22', script: '''#!/usr/bin/env bash
set -euo pipefail

docker build \
  --target build \
  --build-arg "HTTP_PROXY=${HTTP_PROXY}" \
  --build-arg "HTTPS_PROXY=${HTTPS_PROXY}" \
  --build-arg "http_proxy=${http_proxy}" \
  --build-arg "https_proxy=${https_proxy}" \
  --build-arg "NO_PROXY=${NO_PROXY}" \
  --build-arg "no_proxy=${no_proxy}" \
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

docker build \
  --provenance=false \
  --platform linux/amd64 \
  --build-arg "HTTP_PROXY=${HTTP_PROXY}" \
  --build-arg "HTTPS_PROXY=${HTTPS_PROXY}" \
  --build-arg "http_proxy=${http_proxy}" \
  --build-arg "https_proxy=${https_proxy}" \
  --build-arg "NO_PROXY=${NO_PROXY}" \
  --build-arg "no_proxy=${no_proxy}" \
  --build-arg STORAGENT_API_SERVERS \
  --build-arg "VCS_REF=${FRONTEND_GIT_COMMIT}" \
  --tag "${IMAGE_REF}" \
  .

test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.component" }}' "${IMAGE_REF}")" = "frontend"
test "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${IMAGE_REF}")" = "${FRONTEND_GIT_COMMIT}"
if docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE_REF}" | grep -Eiq '^(HTTP_PROXY|HTTPS_PROXY|http_proxy|https_proxy|NO_PROXY|no_proxy)='; then
  echo 'Proxy settings leaked into the runtime image environment.' >&2
  exit 1
fi
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

# Harbor is on the direct list and is reached without the outbound proxy.
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
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
