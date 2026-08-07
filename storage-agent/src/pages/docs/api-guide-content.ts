// 「功能接口引导」内容源。
//
// v1 变更说明（重要）：历史版本允许业务方自由选择「前端直连 / 后端转发」，
// 并且按 TypeScript / Python 两份完全独立的 Markdown 维护。这带来了两个问题：
// 1）一旦前端直接持有 `x-api-key` 并发起上传/下载请求，该 Key 就会出现在浏览器网络
//    面板中，可被复制后冒充 App 任意上传或下载文件；
// 2）两份语言各自独立的文档容易在演进时产生不一致。
// v1 起本页固定为一套逻辑（控制面 / 数据面分离 + 能力令牌），不再由业务方自由决定
// 前后端各自的职责；示例代码合并为同一份文档，按“角色”（App 后端 / 浏览器前端）
// 区分，而不是按开发语言区分（App 后端仍提供 TypeScript / Python 两种参考实现）。
//
// ⚠️ 历史未带版本号的 `/api/*` 接口已完全下线，不再兼容；所有调用请改用 `/api/v1/*`。

import { DEFAULT_DOC_VERSION, type DocVersion } from "./doc-versions"

export type ApiGuideLanguage = "typescript" | "python"

export type ApiGuideParam = {
  name: string
  type?: string
  required?: boolean
  description: string
}

export type ApiGuideParamSection = {
  title: string
  rows: ApiGuideParam[]
}

/** 接口所属的面：公共接口 / 控制面（仅 App 后端可调用）/ 数据面（前端可直连）。 */
export type ApiGuidePlane = "public" | "control" | "data"

/** 代码示例的“角色”维度：App 后端可选 TS/Python 任一实现；浏览器前端只能是 TS/JS。 */
export type ApiGuideCodeVariant = "server-ts" | "server-py" | "browser"

export type ApiGuideEndpoint = {
  id: string
  method: "GET" | "POST"
  path: string
  summary: string
  description: string
  plane: ApiGuidePlane
  authentication: "public" | "api-key" | "api-key-or-token"
  params: ApiGuideParamSection[]
  notes?: string[]
  examples: Partial<Record<ApiGuideCodeVariant, string>>
  response?: string
}

export const API_VERSION = "v1"
export const API_VERSION_PREFIX = "/api/v1"

export const API_GUIDE_CODE_VARIANTS: Record<
  ApiGuideCodeVariant,
  { label: string; fence: string }
> = {
  "server-ts": { label: "App 后端 · TypeScript", fence: "typescript" },
  "server-py": { label: "App 后端 · Python", fence: "python" },
  browser: { label: "浏览器前端 · TypeScript", fence: "typescript" },
}

// --- 以下类型 / 常量仍由「功能组件引导」（file-components-content.ts）复用，保持不变 ---

export const API_GUIDE_LANGUAGES: Array<{
  id: ApiGuideLanguage
  label: string
  runtime: string
  dependency: string
  fence: string
}> = [
  {
    id: "typescript",
    label: "TypeScript",
    runtime: "Node.js 20+",
    dependency: "使用运行时内置 fetch、FormData 与 Blob，无需 HTTP 客户端依赖",
    fence: "typescript",
  },
  {
    id: "python",
    label: "Python",
    runtime: "Python 3.10+",
    dependency: "requests >= 2.31",
    fence: "python",
  },
]

export function isApiGuideLanguage(value: string | null): value is ApiGuideLanguage {
  return value === "typescript" || value === "python"
}

export function getApiGuideLanguage(language: ApiGuideLanguage) {
  return API_GUIDE_LANGUAGES.find((item) => item.id === language) ?? API_GUIDE_LANGUAGES[0]
}

// --- v1 起，本页示例统一区分“角色”而不是“语言” ---

const apiKeyHeaders = (contentType?: string): ApiGuideParamSection => ({
  title: "Headers",
  rows: [
    {
      name: "x-api-key",
      type: "string",
      required: true,
      description: "控制台签发的业务 APIKey。只允许出现在 App 后端到 Storagent 的请求中，绝不能出现在浏览器前端、日志或异常信息里。",
    },
    ...(contentType
      ? [
          {
            name: "Content-Type",
            type: "string",
            required: true,
            description: contentType,
          },
        ]
      : []),
  ],
})

const dataPlaneAuthParams = (contentType?: string): ApiGuideParamSection => ({
  title: "鉴权（二选一）",
  rows: [
    {
      name: "x-api-key",
      type: "string",
      description: "仅供 App 后端到 Storagent 的服务端调用；浏览器前端不得使用此方式。",
    },
    {
      name: "token",
      type: "string",
      description: "Query 参数。App 后端使用 x-api-key 本地签发的能力令牌，浏览器前端应始终使用这种方式。",
    },
    ...(contentType
      ? [
          {
            name: "Content-Type",
            type: "string",
            required: true,
            description: contentType,
          },
        ]
      : []),
  ],
})

export const API_GUIDE_SERVER_SETUP: Record<"typescript" | "python", string> = {
  typescript: `// App 后端（Node.js）：控制面公共请求封装。x-api-key 只在这里出现。
const BASE_URL = (process.env.STORAGENT_BASE_URL ?? "").replace(/\\/+$/, "")
const API_KEY = process.env.STORAGENT_API_KEY

type ApiErrorBody = {
  msg?: string
  data?: unknown
  code?: number
}

class StoragentError extends Error {
  readonly status: number
  readonly body: ApiErrorBody | null

  constructor(message: string, status: number, body: ApiErrorBody | null) {
    super(message)
    this.status = status
    this.body = body
  }
}

export class QuotaExceededError extends StoragentError {
  constructor(status: number, body: ApiErrorBody | null) {
    super("APP 存储超出限额，请联系管理员处理", status, body)
    this.name = "QuotaExceededError"
  }
}

export class UploadPartTooLargeError extends StoragentError {
  constructor(status: number, body: ApiErrorBody | null) {
    super("上传分片超过 64 MiB，请按服务端限制重新切分后上传", status, body)
    this.name = "UploadPartTooLargeError"
  }
}

async function storagentFetch(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<Response> {
  if (!BASE_URL) throw new Error("缺少 STORAGENT_BASE_URL")
  if (authenticated && !API_KEY) throw new Error("缺少 STORAGENT_API_KEY")

  const headers = new Headers(init.headers)
  if (authenticated) headers.set("x-api-key", API_KEY!)

  const response = await fetch(\`\${BASE_URL}\${path}\`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as ApiErrorBody | null
    if (body?.code === 413049) throw new QuotaExceededError(response.status, body)
    if (body?.code === 413050) throw new UploadPartTooLargeError(response.status, body)
    throw new StoragentError(body?.msg ?? \`Storagent HTTP \${response.status}\`, response.status, body)
  }
  return response
}`,
  python: `# App 后端（Python）：控制面公共请求封装。x-api-key 只在这里出现。
import os
from typing import Any

import requests

BASE_URL = os.getenv("STORAGENT_BASE_URL", "").rstrip("/")
API_KEY = os.getenv("STORAGENT_API_KEY")


class StoragentAPIError(RuntimeError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        super().__init__((body or {}).get("msg") or f"Storagent HTTP {status}")


class QuotaExceededError(StoragentAPIError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        RuntimeError.__init__(self, "APP 存储超出限额，请联系管理员处理")


class UploadPartTooLargeError(StoragentAPIError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        RuntimeError.__init__(self, "上传分片超过 64 MiB，请按服务端限制重新切分后上传")


def storagent_request(
    method: str,
    path: str,
    *,
    authenticated: bool = True,
    **kwargs: Any,
) -> requests.Response:
    if not BASE_URL:
        raise RuntimeError("缺少 STORAGENT_BASE_URL")
    if authenticated and not API_KEY:
        raise RuntimeError("缺少 STORAGENT_API_KEY")

    headers = dict(kwargs.pop("headers", {}))
    if authenticated:
        headers["x-api-key"] = API_KEY

    response = requests.request(
        method,
        f"{BASE_URL}{path}",
        headers=headers,
        timeout=30,
        **kwargs,
    )
    if not response.ok:
        try:
            body = response.json()
        except ValueError:
            body = None
        if (body or {}).get("code") == 413049:
            raise QuotaExceededError(response.status_code, body)
        if (body or {}).get("code") == 413050:
            raise UploadPartTooLargeError(response.status_code, body)
        raise StoragentAPIError(response.status_code, body)
    return response`,
}

/**
 * 能力令牌（Capability Token）参考实现：与 Storagent 后端
 * `src/core/capability_token.py` 完全一致的 HMAC-SHA256 算法。
 * App 后端本地签发，不需要额外请求 Storagent。
 */
export const API_GUIDE_CAPABILITY_TOKEN_CODE: Record<"typescript" | "python", string> = {
  typescript: `// App 后端（Node.js）：本地签发能力令牌，无需请求 Storagent。
import { createHash, createHmac } from "node:crypto"

type CapabilityAction = "upload_part" | "download"

function apiKeyRef(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex")
}

export function issueCapabilityToken(
  apiKey: string,
  options: {
    action: CapabilityAction
    objectKey: string
    expiresInSeconds: number
    /** 仅 upload_part 需要，绑定分片上传会话 */
    uploadId?: string
  },
): string {
  const payload: Record<string, unknown> = {
    ref: apiKeyRef(apiKey),
    act: options.action,
    key: options.objectKey,
    exp: Math.floor(Date.now() / 1000) + options.expiresInSeconds,
  }
  if (options.uploadId) payload.uid = options.uploadId

  // 与后端 json.dumps(payload, separators=(",", ":"), sort_keys=True) 保持字节级一致
  const payloadJson = JSON.stringify(payload, Object.keys(payload).sort())
  const payloadBytes = Buffer.from(payloadJson, "utf8")
  const signature = createHmac("sha256", apiKey).update(payloadBytes).digest()

  return \`\${payloadBytes.toString("base64url")}.\${signature.toString("base64url")}\`
}`,
  python: `# App 后端（Python）：本地签发能力令牌，无需请求 Storagent。
import base64
import hashlib
import hmac
import json
import time
from typing import Optional


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def api_key_ref(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def issue_capability_token(
    api_key: str,
    *,
    action: str,
    object_key: str,
    expires_in_seconds: int,
    upload_id: Optional[str] = None,
) -> str:
    payload: dict = {
        "ref": api_key_ref(api_key),
        "act": action,
        "key": object_key,
        "exp": int(time.time()) + expires_in_seconds,
    }
    if upload_id:
        payload["uid"] = upload_id
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(api_key.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"`,
}

export const API_GUIDE_ERROR_EXAMPLES: Record<"typescript" | "python", string> = {
  typescript: `try {
  const response = await storagentFetch("/api/v1/files/object/stat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ object_key: "path/to/file.bin" }),
  })
  console.log(await response.json())
} catch (error) {
  if (error instanceof QuotaExceededError) {
    console.error("APP 存储超出限额，请联系管理员处理；该请求不应自动重试。")
  } else if (error instanceof UploadPartTooLargeError) {
    console.error("分片超过 64 MiB；请重新切分，不要重试相同请求。")
  } else if (error instanceof StoragentError && error.body?.code === 404032) {
    const data = error.body.data as { available_at?: Array<{ download_url: string }> }
    console.log("对象不在当前节点，可从以下节点下载：", data.available_at ?? [])
  } else {
    throw error
  }
}`,
  python: `try:
    response = storagent_request(
        "POST",
        "/api/v1/files/object/stat",
        json={"object_key": "path/to/file.bin"},
    )
    print(response.json())
except StoragentAPIError as exc:
    if isinstance(exc, QuotaExceededError):
        print("APP 存储超出限额，请联系管理员处理；该请求不应自动重试。")
    elif isinstance(exc, UploadPartTooLargeError):
        print("分片超过 64 MiB；请重新切分，不要重试相同请求。")
    elif (exc.body or {}).get("code") == 404032:
        data = (exc.body or {}).get("data") or {}
        print("对象不在当前节点，可从以下节点下载：", data.get("available_at", []))
    else:
        raise`,
}

/**
 * 最小可运行 Demo：把「推荐流程」收成一份可直接照抄的 App 后端 + 浏览器前端代码。
 * 对照 system-test 联调夹具；目标是只读本 Markdown 就能拼出完整上传/下载。
 */
export const API_GUIDE_MINIMAL_DEMO: Record<"app-ts" | "app-py" | "browser", string> = {
  "app-ts": `// App 后端业务接口（Node.js / Express 风格示意）
// 依赖上文的 storagentFetch + issueCapabilityToken；x-api-key 只出现在这里。
import express from "express"

const app = express()
app.use(express.json())
const STORAGE_BASE_URL = (process.env.STORAGENT_BASE_URL ?? "").replace(/\\/+$/, "")
const API_KEY = process.env.STORAGENT_API_KEY!

// POST /app/upload/init  body: { size_bytes, content_type? }
app.post("/app/upload/init", async (req, res) => {
  const sizeBytes = Number(req.body?.size_bytes ?? 0)
  if (sizeBytes <= 0) {
    return res.status(400).json({ error: "空文件暂不支持上传" })
  }
  const initRes = await storagentFetch("/api/v1/files/multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size_bytes: sizeBytes,
      content_type: req.body?.content_type ?? "application/octet-stream",
    }),
  })
  const upload = (await initRes.json()) as {
    upload_id: string
    bucket: string
    object_key: string
  }
  const part_token = issueCapabilityToken(API_KEY, {
    action: "upload_part",
    objectKey: upload.object_key,
    uploadId: upload.upload_id,
    expiresInSeconds: 2 * 60 * 60,
  })
  // 浏览器拿这些字段去直连数据面；绝不下发 API_KEY
  res.json({
    ...upload,
    part_token,
    storagent_base: STORAGE_BASE_URL,
    part_url: \`\${STORAGE_BASE_URL}/api/v1/files/multipart/part\`,
  })
})

// POST /app/upload/complete  body: { upload_id, object_key, parts: [{part_number, etag}] }
app.post("/app/upload/complete", async (req, res) => {
  const { upload_id, object_key, parts } = req.body ?? {}
  const completeRes = await storagentFetch("/api/v1/files/multipart/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id, object_key, parts }),
  })
  res.status(completeRes.status).json(await completeRes.json())
})

// POST /app/upload/abort  body: { upload_id, object_key }
app.post("/app/upload/abort", async (req, res) => {
  const { upload_id, object_key } = req.body ?? {}
  const abortRes = await storagentFetch("/api/v1/files/multipart/abort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id, object_key }),
  })
  res.status(abortRes.status).json(await abortRes.json())
})

// POST /app/download/url  body: { object_key }
app.post("/app/download/url", async (req, res) => {
  const objectKey = String(req.body?.object_key ?? "")
  // 此处应先做业务鉴权（当前用户是否可读该 object_key）
  const token = issueCapabilityToken(API_KEY, {
    action: "download",
    objectKey,
    expiresInSeconds: 10 * 60,
  })
  const download_url =
    \`\${STORAGE_BASE_URL}/api/v1/files/object/download?\` +
    new URLSearchParams({ object_key: objectKey, token })
  res.json({ download_url, object_key: objectKey })
})

app.listen(8790)`,

  "app-py": `# App 后端业务接口（FastAPI 示意）
# 依赖上文的 storagent_request + issue_capability_token；x-api-key 只出现在这里。
import os
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()
STORAGE_BASE_URL = os.environ["STORAGENT_BASE_URL"].rstrip("/")
API_KEY = os.environ["STORAGENT_API_KEY"]


class InitBody(BaseModel):
    size_bytes: int = Field(..., gt=0)
    content_type: str = "application/octet-stream"


class PartItem(BaseModel):
    part_number: int
    etag: str


class CompleteBody(BaseModel):
    upload_id: str
    object_key: str
    parts: list[PartItem]


class AbortBody(BaseModel):
    upload_id: str
    object_key: str


class DownloadBody(BaseModel):
    object_key: str


@app.post("/app/upload/init")
def upload_init(body: InitBody):
    upload = storagent_request(
        "POST",
        "/api/v1/files/multipart/init",
        json={"size_bytes": body.size_bytes, "content_type": body.content_type},
    ).json()
    part_token = issue_capability_token(
        API_KEY,
        action="upload_part",
        object_key=upload["object_key"],
        upload_id=upload["upload_id"],
        expires_in_seconds=2 * 60 * 60,
    )
    return {
        **upload,
        "part_token": part_token,
        "storagent_base": STORAGE_BASE_URL,
        "part_url": f"{STORAGE_BASE_URL}/api/v1/files/multipart/part",
    }


@app.post("/app/upload/complete")
def upload_complete(body: CompleteBody):
    return storagent_request(
        "POST",
        "/api/v1/files/multipart/complete",
        json=body.model_dump(),
    ).json()


@app.post("/app/upload/abort")
def upload_abort(body: AbortBody):
    return storagent_request(
        "POST",
        "/api/v1/files/multipart/abort",
        json=body.model_dump(),
    ).json()


@app.post("/app/download/url")
def download_url(body: DownloadBody):
    # 此处应先做业务鉴权
    token = issue_capability_token(
        API_KEY,
        action="download",
        object_key=body.object_key,
        expires_in_seconds=10 * 60,
    )
    from urllib.parse import urlencode
    qs = urlencode({"object_key": body.object_key, "token": token})
    return {
        "download_url": f"{STORAGE_BASE_URL}/api/v1/files/object/download?{qs}",
        "object_key": body.object_key,
    }`,

  browser: `// 浏览器前端：完整上传 + 下载（永不出现 x-api-key）
// App 后端地址例如 http://127.0.0.1:8790；Storagent 数据面地址来自 init 响应
const APP_BASE = "" // 与页面同源时留空；跨域时填 App 后端根地址
const PART_SIZE = 5 * 1024 * 1024 // 5 MiB；可按 ceil(size/10000) 向上取 MiB 对齐增大

async function appJson(path: string, init?: RequestInit) {
  const res = await fetch(APP_BASE + path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(\`App \${res.status}\`), { body })
  return body
}

/** 上传：App init → 浏览器直连 part(token) → App complete */
export async function uploadFile(file: File) {
  if (file.size <= 0) throw new Error("空文件暂不支持上传")

  const init = await appJson("/app/upload/init", {
    method: "POST",
    body: JSON.stringify({
      size_bytes: file.size,
      content_type: file.type || "application/octet-stream",
    }),
  }) as {
    upload_id: string
    object_key: string
    part_token: string
    part_url: string
    storagent_base: string
  }

  const parts: Array<{ part_number: number; etag: string }> = []
  const totalParts = Math.ceil(file.size / PART_SIZE) || 1
  for (let i = 0; i < totalParts; i++) {
    const blob = file.slice(i * PART_SIZE, Math.min(file.size, (i + 1) * PART_SIZE))
    const form = new FormData()
    form.set("upload_id", init.upload_id)
    form.set("object_key", init.object_key)
    form.set("part_number", String(i + 1))
    form.set("file", blob, \`part-\${i + 1}.bin\`)

    // 数据面直连 Storagent；若出现 TypeError: Failed to fetch，检查 CORS 是否放行当前 Origin
    const url = new URL(init.part_url)
    url.searchParams.set("token", init.part_token)
    const partRes = await fetch(url, { method: "POST", body: form })
    const partBody = await partRes.json().catch(() => ({}))
    if (!partRes.ok) throw Object.assign(new Error(\`part \${i + 1} \${partRes.status}\`), { body: partBody })
    parts.push({ part_number: partBody.part_number, etag: partBody.etag })
  }

  const done = await appJson("/app/upload/complete", {
    method: "POST",
    body: JSON.stringify({
      upload_id: init.upload_id,
      object_key: init.object_key,
      parts,
    }),
  })
  return done as { bucket: string; object_key: string; etag?: string }
}

/** 下载：App 签发 download_url → 浏览器直连流式拉取并触发保存 */
export async function downloadFile(objectKey: string, filename?: string) {
  const issued = await appJson("/app/download/url", {
    method: "POST",
    body: JSON.stringify({ object_key: objectKey }),
  }) as { download_url: string }

  const res = await fetch(issued.download_url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(\`download \${res.status}\`), { body })
  }
  const blob = await res.blob()
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename || objectKey.split("/").pop() || "download.bin"
  a.click()
  URL.revokeObjectURL(a.href)
  return { bytes: blob.size, object_key: objectKey }
}

// 用法：
// const done = await uploadFile(fileInput.files[0])
// await downloadFile(done.object_key)
`,
}

export const API_GUIDE_ENDPOINTS: ApiGuideEndpoint[] = [
  {
    id: "endpoints-list",
    method: "GET",
    path: "/api/v1/public/endpoints",
    summary: "列出服务端点",
    description: "返回所有区域的 Storagent 与 MinIO 地址。浏览器前端可直接调用（公共信息，不含任何凭据），用于探测各 Storagent endpoint 并选择低时延节点。",
    plane: "public",
    authentication: "public",
    params: [
      {
        title: "Returns",
        rows: [
          { name: "data[].region_id", type: "string", required: true, description: "区域 ID" },
          { name: "data[].server_id", type: "string", required: true, description: "MinIO 服务记录 ID" },
          { name: "data[].name", type: "string", required: true, description: "稳定区域标识，如 beijing" },
          { name: "data[].shown_name", type: "string", required: true, description: "区域展示名称" },
          { name: "data[].master", type: "boolean", required: true, description: "是否为该区域主节点" },
          { name: "data[].endpoint", type: "string", required: true, description: "Storagent API 基址" },
          { name: "data[].minio_endpoint", type: "string", required: true, description: "MinIO 地址，仅作拓扑信息使用" },
        ],
      },
    ],
    notes: ["该接口无需任何凭据，浏览器前端可直接调用。不要直接使用 MinIO 凭据。"],
    examples: {
      browser: `type Endpoint = {
  region_id: string
  server_id: string
  name: string
  shown_name: string
  master: boolean
  endpoint: string
  minio_endpoint: string
}

const response = await fetch("https://storagent.example.com/api/v1/public/endpoints")
const { data } = (await response.json()) as { data: Endpoint[] }
console.table(data.map(({ name, endpoint, master }) => ({ name, endpoint, master })))`,
    },
    response: `{
  "data": [
    {
      "region_id": "...",
      "server_id": "...",
      "name": "hangzhou",
      "shown_name": "杭州",
      "master": true,
      "endpoint": "https://hz.example.com",
      "minio_endpoint": "https://hz-minio.example.com"
    }
  ]
}`,
  },
  {
    id: "endpoints-test",
    method: "GET",
    path: "/api/v1/public/endpoints/test",
    summary: "探测端点延迟",
    description: "返回 512 字节随机二进制，避免缓存干扰。浏览器前端对候选 endpoint 并发探测，优先选择可达且耗时最低的节点，作为后续数据面直传/直连下载的目标地址。",
    plane: "public",
    authentication: "public",
    params: [],
    notes: ["响应类型为 application/octet-stream，不是 JSON。生产实现应设置超时，并定期重新探测。"],
    examples: {
      browser: `const startedAt = performance.now()
const response = await fetch("https://storagent.example.com/api/v1/public/endpoints/test")
const payload = new Uint8Array(await response.arrayBuffer())
console.log({ bytes: payload.byteLength, elapsedMs: performance.now() - startedAt })`,
    },
  },
  {
    id: "multipart-init",
    method: "POST",
    path: "/api/v1/files/multipart/init",
    summary: "初始化分片上传（控制面）",
    description: "只能由 App 后端调用。创建 multipart 会话并由服务端生成 object_key。请求必须声明完整文件字节数，服务端会在创建会话前跨区域检查 APP 存储配额，并按 size_bytes 预留声明容量；新 APP 默认配额为 100 GiB。成功后 App 后端应为即将到来的分片上传签发能力令牌（见下一节）。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders("application/json"),
      {
        title: "Body",
        rows: [
          { name: "content_type", type: "string", description: "对象 MIME；默认 application/octet-stream" },
          { name: "size_bytes", type: "integer", required: true, description: "待上传完整非空文件的字节数，必须大于 0，用于创建会话前执行配额校验" },
        ],
      },
      {
        title: "Returns",
        rows: [
          { name: "upload_id", type: "string", required: true, description: "分片上传会话 ID" },
          { name: "bucket", type: "string", required: true, description: "APIKey 所属应用桶" },
          { name: "object_key", type: "string", required: true, description: "服务端生成的对象键" },
        ],
      },
    ],
    notes: [
      "业务数据库应暂存 upload_id 与 object_key，以支持刷新页面后的断点续传和失败清理。",
      "客户端应在发送 init 前拒绝空文件，避免创建无效上传会话。",
      "multipart complete 成功或 multipart abort 完成时会释放该会话的跨区域预留容量；取消或不可恢复失败时必须调用 abort。",
      "业务码 413049 表示 APP 存储超出限额；不要继续重试或上传分片，应联系应用管理员调整配额或清理空间。",
    ],
    examples: {
      "server-ts": `import { stat } from "node:fs/promises"

type MultipartInit = { upload_id: string; bucket: string; object_key: string }

const source = await stat("./document.pdf")
if (source.size <= 0) throw new Error("空文件暂不支持上传，请选择包含内容的文件")

const response = await storagentFetch("/api/v1/files/multipart/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content_type: "application/pdf", size_bytes: source.size }),
})
const upload = (await response.json()) as MultipartInit
console.log(upload)`,
      "server-py": `from pathlib import Path

source = Path("./document.pdf")
if source.stat().st_size <= 0:
    raise ValueError("空文件暂不支持上传，请选择包含内容的文件")
response = storagent_request(
    "POST",
    "/api/v1/files/multipart/init",
    json={"content_type": "application/pdf", "size_bytes": source.stat().st_size},
)
upload = response.json()
print(upload)`,
    },
    response: `{
  "upload_id": "upload-...",
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060"
}`,
  },
  {
    id: "multipart-part",
    method: "POST",
    path: "/api/v1/files/multipart/part",
    summary: "上传单个分片（数据面）",
    description: "以 multipart/form-data 上传一个分片。**这是浏览器前端应当直连的接口**：App 后端在 init 之后使用 x-api-key 本地签发一枚绑定当前 upload_id + object_key、action=upload_part、建议 2 小时量级有效期的能力令牌，交给前端；前端始终携带 `?token=...`，永远不持有 x-api-key。part_number 从 1 开始且最多为 10,000；默认分片为 5 MiB，客户端应取配置值与 ceil(文件大小 / 10000) 的较大值并向上对齐到 MiB；除最后一片外至少 5 MiB，单片不得超过服务端默认上限 64 MiB；因此默认策略最多支持 625 GiB。同一 part_number 可在网络或校验失败后重传，最后一次成功上传的 ETag 和分片大小生效。",
    plane: "data",
    authentication: "api-key-or-token",
    params: [
      dataPlaneAuthParams("multipart/form-data；由客户端自动附加 boundary，不要手动设置该请求头"),
      {
        title: "Form fields",
        rows: [
          { name: "upload_id", type: "string", required: true, description: "init 返回的会话 ID" },
          { name: "object_key", type: "string", required: true, description: "init 返回的对象键" },
          { name: "part_number", type: "integer", required: true, description: "1-10000；同一编号可顺序重传" },
          { name: "file", type: "binary", required: true, description: "本分片的二进制内容；服务端默认最大 64 MiB" },
        ],
      },
      {
        title: "Returns",
        rows: [
          { name: "part_number", type: "integer", required: true, description: "已上传的分片序号" },
          { name: "etag", type: "string", required: true, description: "完成上传时必须回传该编号最后一次成功上传的 ETag" },
        ],
      },
    ],
    notes: [
      "能力令牌中的 act/key（及 uid）必须与本次请求的 upload_id/object_key 完全一致，否则返回 403053（能力令牌与请求的动作或对象不匹配）。",
      "可以并发上传不同 part_number；不要并发重传同一编号，应在前一次失败后顺序执行有限次数重试。",
      "每次重传成功后覆盖业务侧保存的 ETag；parts 查询中该 part_number 的 ETag 和 size 也以最后一次成功上传为准。",
      "业务码 413050 表示当前分片超过 64 MiB；不要重试相同负载，应使用合规大小重新切分。",
      "业务码 401051/401052/403053 分别表示令牌无效 / 已过期 / 作用域不匹配；这些情况都应回到 App 后端重新申请令牌，而不是原样重试。",
    ],
    examples: {
      "server-ts": `// App 后端：init 成功后立即为整个上传会话签发一枚分片上传令牌
const partToken = issueCapabilityToken(API_KEY!, {
  action: "upload_part",
  objectKey: upload.object_key,
  uploadId: upload.upload_id,
  expiresInSeconds: 2 * 60 * 60, // 2 小时量级
})
// 将 upload_id / object_key / partToken 一并返回给前端
return { ...upload, part_token: partToken }`,
      "server-py": `# App 后端：init 成功后立即为整个上传会话签发一枚分片上传令牌
part_token = issue_capability_token(
    API_KEY,
    action="upload_part",
    object_key=upload["object_key"],
    upload_id=upload["upload_id"],
    expires_in_seconds=2 * 60 * 60,  # 2 小时量级
)
# 将 upload_id / object_key / part_token 一并返回给前端`,
      browser: `// 浏览器前端：拿到 App 后端下发的 { upload_id, object_key, part_token } 后直连 Storagent
const MAX_UPLOAD_PART_BYTES = 64 * 1024 * 1024

async function uploadPart(baseURL: string, blob: Blob, partNumber: number) {
  if (blob.size > MAX_UPLOAD_PART_BYTES) {
    throw new Error("分片超过服务端默认上限 64 MiB，请重新切分")
  }
  const form = new FormData()
  form.set("upload_id", uploadId)
  form.set("object_key", objectKey)
  form.set("part_number", String(partNumber))
  form.set("file", blob, \`part-\${partNumber}.bin\`)

  const url = new URL("/api/v1/files/multipart/part", baseURL)
  url.searchParams.set("token", partToken) // 注意：这里从不出现 x-api-key
  const response = await fetch(url, { method: "POST", body: form })
  if (!response.ok) throw new Error(\`上传分片失败: \${response.status}\`)
  return (await response.json()) as { part_number: number; etag: string }
}`,
    },
    response: `{
  "part_number": 1,
  "etag": "b1946ac92492d2347c6235b4d2611184"
}`,
  },
  {
    id: "multipart-parts",
    method: "GET",
    path: "/api/v1/files/multipart/parts",
    summary: "查询已上传分片（控制面）",
    description: "只能由 App 后端调用，用于断点续传前查询服务端已接收的分片，避免不必要的重传。同一 part_number 如曾重传，返回最后一次成功上传的 ETag 和 size。每次最多返回 1000 条，可用 part_number_marker 继续翻页。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders(),
      {
        title: "Query",
        rows: [
          { name: "upload_id", type: "string", required: true, description: "init 返回的会话 ID" },
          { name: "object_key", type: "string", required: true, description: "init 返回的对象键" },
          { name: "part_number_marker", type: "string", description: "上一页最后一个分片标记" },
        ],
      },
    ],
    examples: {
      "server-ts": `const query = new URLSearchParams({
  upload_id: upload.upload_id,
  object_key: upload.object_key,
})
const response = await storagentFetch(\`/api/v1/files/multipart/parts?\${query}\`)
const result = (await response.json()) as {
  upload_id: string
  parts: Array<{ part_number: number; etag: string; size?: number }>
}
console.table(result.parts)`,
      "server-py": `response = storagent_request(
    "GET",
    "/api/v1/files/multipart/parts",
    params={
        "upload_id": upload["upload_id"],
        "object_key": upload["object_key"],
    },
)
print(response.json()["parts"])`,
    },
    response: `{
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060",
  "upload_id": "upload-...",
  "parts": [
    {
      "part_number": 1,
      "etag": "b1946ac92492d2347c6235b4d2611184",
      "size": 5242880,
      "last_modified": "2026-07-31T08:00:00Z"
    }
  ]
}`,
  },
  {
    id: "multipart-complete",
    method: "POST",
    path: "/api/v1/files/multipart/complete",
    summary: "完成分片上传（控制面）",
    description: "只能由 App 后端调用。前端把已上传分片的 part_number + etag 列表提交给 App 后端的业务接口后，由 App 后端汇总并调用本接口；服务端按 part_number 排序并合并对象。只有此接口成功后，对象才算完成上传，同时释放 init 为该会话创建的跨区域预留容量。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders("application/json"),
      {
        title: "Body",
        rows: [
          { name: "upload_id", type: "string", required: true, description: "init 返回的会话 ID" },
          { name: "object_key", type: "string", required: true, description: "init 返回的对象键" },
          { name: "parts", type: "array", required: true, description: "全部分片的 part_number 与 etag，至少一项" },
        ],
      },
    ],
    notes: ["完成前应确认所有分片均已成功；同一编号发生过重传时必须使用最新 ETag。ETag 可带或不带首尾双引号。"],
    examples: {
      "server-ts": `const uploadedParts = [{ part_number: part.part_number, etag: part.etag }]
const response = await storagentFetch("/api/v1/files/multipart/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    upload_id: upload.upload_id,
    object_key: upload.object_key,
    parts: uploadedParts,
  }),
})
console.log(await response.json())`,
      "server-py": `uploaded_parts = [{"part_number": part["part_number"], "etag": part["etag"]}]
response = storagent_request(
    "POST",
    "/api/v1/files/multipart/complete",
    json={
        "upload_id": upload["upload_id"],
        "object_key": upload["object_key"],
        "parts": uploaded_parts,
    },
)
print(response.json())`,
    },
    response: `{
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060",
  "etag": "...",
  "version_id": "..."
}`,
  },
  {
    id: "multipart-abort",
    method: "POST",
    path: "/api/v1/files/multipart/abort",
    summary: "中止分片上传（控制面）",
    description: "只能由 App 后端调用。用户取消或上传无法恢复时释放未完成的 multipart 会话、残留分片和 init 为该会话创建的跨区域预留容量。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders("application/json"),
      {
        title: "Body",
        rows: [
          { name: "upload_id", type: "string", required: true, description: "init 返回的会话 ID" },
          { name: "object_key", type: "string", required: true, description: "init 返回的对象键" },
          { name: "bucket", type: "string", description: "兼容字段；实际桶由 APIKey 绑定的应用决定" },
        ],
      },
    ],
    examples: {
      "server-ts": `const response = await storagentFetch("/api/v1/files/multipart/abort", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    upload_id: upload.upload_id,
    object_key: upload.object_key,
  }),
})
console.log(await response.json())`,
      "server-py": `response = storagent_request(
    "POST",
    "/api/v1/files/multipart/abort",
    json={
        "upload_id": upload["upload_id"],
        "object_key": upload["object_key"],
    },
)
print(response.json())`,
    },
    response: `{
  "bucket": "your-app",
  "object_key": "8f66367a-a29f-4507-8cb7-aff361174060",
  "upload_id": "upload-...",
  "aborted": true
}`,
  },
  {
    id: "object-stat",
    method: "POST",
    path: "/api/v1/files/object/stat",
    summary: "获取对象元信息（控制面）",
    description: "只能由 App 后端调用；前端不直接访问对象元信息，如需展示大小等信息，应由 App 后端查询后随业务响应一并返回。object_key 与 APIKey 均不进入 URL。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders("application/json"),
      {
        title: "Body",
        rows: [
          { name: "object_key", type: "string", required: true, description: "multipart/init 返回的对象键" },
        ],
      },
      {
        title: "Returns",
        rows: [
          { name: "size", type: "integer", required: true, description: "对象字节数" },
          { name: "etag", type: "string", required: true, description: "对象 ETag，可用于完整性比对" },
          { name: "content_type", type: "string | null", description: "对象 MIME" },
          { name: "last_modified", type: "datetime | null", description: "最后修改时间" },
          { name: "region", type: "string | null", description: "当前对象所在区域" },
          { name: "local", type: "boolean", required: true, description: "是否位于当前访问节点" },
        ],
      },
    ],
    notes: ["若当前节点没有对象但其他节点存在，返回业务码 404032，data.available_at 给出可用下载地址。"],
    examples: {
      "server-ts": `const response = await storagentFetch("/api/v1/files/object/stat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ object_key: "path/to/file.bin" }),
})
console.log(await response.json())`,
      "server-py": `response = storagent_request(
    "POST",
    "/api/v1/files/object/stat",
    json={"object_key": "path/to/file.bin"},
)
print(response.json())`,
    },
    response: `{
  "bucket": "your-app",
  "object_key": "path/to/file.bin",
  "size": 1048576,
  "etag": "...",
  "content_type": "application/octet-stream",
  "last_modified": "2026-07-31T08:00:00Z",
  "region": "beijing",
  "local": true
}`,
  },
  {
    id: "object-download",
    method: "GET",
    path: "/api/v1/files/object/download",
    summary: "下载对象或字节区间（数据面）",
    description: "流式读取整个对象，或通过 offset/length 获取固定字节区间。**这是浏览器前端应当直连的接口**：前端先向 App 后端的业务接口申请下载，App 后端校验权限后用 x-api-key 本地签发一枚 action=download、绑定 object_key、建议 5-15 分钟极短有效期的能力令牌，拼成最终下载 URL 返回给前端；前端直接对该 URL 发起 GET，永远不持有 x-api-key。",
    plane: "data",
    authentication: "api-key-or-token",
    params: [
      dataPlaneAuthParams(),
      {
        title: "Query",
        rows: [
          { name: "object_key", type: "string", required: true, description: "对象键" },
          { name: "offset", type: "integer", description: "起始字节，默认 0" },
          { name: "length", type: "integer", description: "读取长度；0 表示读到末尾" },
        ],
      },
    ],
    notes: [
      "响应为二进制；length > 0 时可能返回 206。大文件不要一次性读入内存，应将响应流直接传给文件或下游响应。",
      "能力令牌中的 act/key 必须与本次请求的 object_key 完全一致，否则返回 403053。",
      "下载令牌建议只给 5-15 分钟有效期：即使前端把最终 URL 分享出去，链接也会很快失效。",
    ],
    examples: {
      "server-ts": `// App 后端：业务鉴权通过后，签发一枚极短期下载令牌并拼出最终 URL
const downloadToken = issueCapabilityToken(API_KEY!, {
  action: "download",
  objectKey: objectKey,
  expiresInSeconds: 10 * 60, // 5-15 分钟量级
})
const downloadUrl = \`\${STORAGE_BASE_URL}/api/v1/files/object/download?\` +
  new URLSearchParams({ object_key: objectKey, token: downloadToken })
return { download_url: downloadUrl }`,
      "server-py": `# App 后端：业务鉴权通过后，签发一枚极短期下载令牌并拼出最终 URL
download_token = issue_capability_token(
    API_KEY,
    action="download",
    object_key=object_key,
    expires_in_seconds=10 * 60,  # 5-15 分钟量级
)
download_url = (
    f"{STORAGE_BASE_URL}/api/v1/files/object/download?"
    f"object_key={object_key}&token={download_token}"
)
# 将 download_url 返回给前端`,
      browser: `// 浏览器前端：拿到 App 后端下发的 download_url 后流式下载并保存（永不出现 x-api-key）
const response = await fetch(downloadUrl) // download_url 已内含 object_key 与 token
if (!response.ok) throw new Error(\`下载失败: \${response.status}\`)
const blob = await response.blob()
const a = document.createElement("a")
a.href = URL.createObjectURL(blob)
a.download = objectKey.split("/").pop() || "download.bin"
a.click()
URL.revokeObjectURL(a.href)`,
    },
  },
  {
    id: "object-locate",
    method: "GET",
    path: "/api/v1/files/object/locate",
    summary: "定位对象所在节点（控制面）",
    description: "只能由 App 后端调用，扫描各服务点并返回对象实际存在的位置。用于主动选择就近下载节点、为下载令牌选定目标 Storagent 基址，不应在每次普通下载前无条件调用。",
    plane: "control",
    authentication: "api-key",
    params: [
      apiKeyHeaders(),
      {
        title: "Query",
        rows: [
          { name: "object_key", type: "string", required: true, description: "对象键" },
          { name: "offset", type: "integer", description: "生成 download_url 使用的起始字节，默认 0" },
          { name: "length", type: "integer", description: "生成 download_url 使用的长度，默认 0" },
        ],
      },
      {
        title: "Returns",
        rows: [
          { name: "current_region", type: "string", required: true, description: "当前 Storagent 区域" },
          { name: "local_exists", type: "boolean", required: true, description: "当前节点是否有对象" },
          { name: "available_at[]", type: "array", required: true, description: "存在对象的节点及 stat/download 调用信息" },
        ],
      },
    ],
    notes: [
      "该接口需要跨节点探测并带有频控。返回的 stat_url 与 download_url 仍是控制面/数据面接口，App 后端应各自按 x-api-key 或能力令牌规则调用。",
    ],
    examples: {
      "server-ts": `const query = new URLSearchParams({ object_key: "path/to/file.bin" })
const response = await storagentFetch(\`/api/v1/files/object/locate?\${query}\`)
const location = (await response.json()) as {
  current_region: string
  local_exists: boolean
  available_at: Array<{ region: string; endpoint: string; download_url: string }>
}
console.table(location.available_at)`,
      "server-py": `response = storagent_request(
    "GET",
    "/api/v1/files/object/locate",
    params={"object_key": "path/to/file.bin"},
)
location = response.json()
for item in location["available_at"]:
    print(item["region"], item["download_url"])`,
    },
    response: `{
  "bucket": "your-app",
  "object_key": "path/to/file.bin",
  "current_region": "beijing",
  "local_exists": true,
  "available_at": [
    {
      "region": "beijing",
      "shown_name": "北京",
      "master": true,
      "endpoint": "https://bj.example.com",
      "stat_url": "https://bj.example.com/api/v1/files/object/stat",
      "stat_method": "POST",
      "stat_body": { "object_key": "path/to/file.bin" },
      "download_url": "https://bj.example.com/api/v1/files/object/download?object_key=path%2Fto%2Ffile.bin&offset=0&length=0"
    }
  ]
}`,
  },
]

export const API_GUIDE_ERROR_CODES = [
  ["400029", "APIKey 无效", "检查服务端环境变量和密钥是否已吊销"],
  ["400030", "APIKey 已过期", "重新签发并更新密钥"],
  ["400031", "应用未启用", "等待管理员完成应用授权"],
  ["413049", "APP 存储超出限额", "停止重试并联系应用管理员调整配额或清理空间"],
  ["413050", "上传分片超过服务端限制", "不要原样重试；按不超过 64 MiB 重新切分"],
  ["404032", "对象不在当前节点", "读取 data.available_at，改用可用节点"],
  ["404033", "所有节点均不存在对象", "停止重试并核对 object_key"],
  ["429041", "定位请求过于频繁", "指数退避并缓存定位结果"],
  ["503040", "跨节点同步失败", "保留上下文后重试或告警"],
  ["401051", "能力令牌无效（签名不匹配或格式错误）", "回到 App 后端重新签发令牌，不要重试原令牌"],
  ["401052", "能力令牌已过期", "回到 App 后端重新签发一枚更短有效期的令牌"],
  ["403053", "能力令牌与请求的动作或对象不匹配", "检查 object_key/upload_id 是否与签发时一致；不要跨对象复用令牌"],
] as const

function markdownTable(headers: string[], rows: string[][]) {
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ")
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n")
}

function codeFence(language: string, code: string) {
  return `\`\`\`${language}\n${code.trim()}\n\`\`\``
}

/**
 * 生成唯一一份「功能接口引导」Markdown（v1）。
 * 不再按语言拆分成两份独立文档；App 后端相关代码同时给出 TypeScript 与 Python，
 * 浏览器前端相关代码固定为 TypeScript/JS（浏览器不运行 Python）。
 */
export function generateApiGuideMarkdown() {
  const lines: string[] = [
    `# Storagent 存储 API 接入指南（${API_VERSION}）`,
    "",
    "> 本文由 Storagent 控制台的结构化接口定义生成，是「功能接口引导」唯一维护的一份文档。",
    "",
    "## 版本说明",
    "",
    `- 当前业务接口版本为 **${API_VERSION}**，统一挂载在 \`${API_VERSION_PREFIX}\` 前缀下。`,
    "- 历史未带版本号的 `/api/*` 接口已经**完全下线，不再兼容**：其鉴权模型允许前端直接持有 `x-api-key`，一旦经浏览器网络面板泄露即可被冒用发起任意上传/下载，视为不安全设计，已被本页描述的能力令牌机制完全取代。",
    "- 本页不再要求你“自由选择前后端各自的实现方式”：前端和 App 后端的职责是固定的，见下节。",
    "",
    "## 给开发者与 AI 的实施目标",
    "",
    "使用本文为业务系统实现 Storagent 文件上传、断点续传、元信息查询、跨区域定位和流式下载。生成实现时必须保留这里给出的 HTTP 方法、路径、鉴权位置和字段名，并严格按“控制面 / 数据面”的角色边界分工，不要让浏览器前端持有 `x-api-key`。",
    "",
    "## 控制面 / 数据面与能力令牌",
    "",
    "- **控制面**（`multipart/init`、`multipart/complete`、`multipart/abort`、`multipart/parts`、`object/stat`、`object/locate`）：只允许 App 后端使用 `x-api-key` 调用，浏览器前端永远不直接访问。",
    "- **数据面**（`multipart/part` 分片上传、`object/download` 下载）：浏览器前端应当直连 Storagent，但改用 App 后端签发的**能力令牌**（`token` 查询参数），不使用 `x-api-key`。",
    "- **CORS**：浏览器直连数据面时，Storagent 的 `BACKEND_CORS_ORIGINS` / `FRONT_URL` 必须包含页面 Origin。生产环境禁止 `BACKEND_CORS_ORIGINS=[\"*\"]`；若未放行，预检返回 `Disallowed CORS origin`，浏览器表现为 `TypeError: Failed to fetch`（控制面 init 可能已成功，失败发生在随后的 part/download）。",
    "- 能力令牌由 App 后端使用共享的 `x-api-key` 明文作为 HMAC-SHA256 密钥，在本地对一份只读的能力描述签名，无需请求 Storagent（类似 S3 预签名 URL）：",
    "",
    markdownTable(
      ["字段", "含义"],
      [
        ["ref", "该 x-api-key 的 SHA256 摘要，供 Storagent 反查对应的应用；本身不泄露明文 Key"],
        ["act", "允许的动作：`upload_part` 或 `download`"],
        ["key", "绑定的 object_key，必须与请求参数完全一致"],
        ["exp", "Unix 秒级过期时间；上传令牌建议 2 小时量级，下载令牌建议 5-15 分钟量级"],
        ["uid", "仅分片上传场景使用，绑定 upload_id"],
      ],
    ),
    "",
    "Token 格式固定为 `Base64Url(Payload JSON).Base64Url(HMAC-SHA256 签名)`。Storagent 收到请求后按 `ref` 反查对应 APIKey、解密出明文重新计算签名，并核对 `act`/`key`（及 `uid`）与请求参数完全一致、未过期才放行；前端即使截获 Token，也只能在有效期内对指定文件完成指定的单一动作。",
    "",
    "#### 能力令牌签发 · TypeScript",
    "",
    codeFence("typescript", API_GUIDE_CAPABILITY_TOKEN_CODE.typescript),
    "",
    "#### 能力令牌签发 · Python",
    "",
    codeFence("python", API_GUIDE_CAPABILITY_TOKEN_CODE.python),
    "",
    "### 不可违反的安全约束",
    "",
    "- `x-api-key` 只能由 App 后端持有，并通过请求头发送；浏览器前端、移动端包、日志和异常信息中都不能出现它。",
    "- 浏览器前端调用数据面接口时，必须使用能力令牌（`token` 查询参数），不得使用 `x-api-key`。",
    "- Base URL 与 APIKey 通过环境变量注入，不写死真实凭据。",
    "- `object_key` 应视作不透明字符串，必须使用标准 URL 编码或 JSON 序列化。",
    "- 上传失败或用户取消时调用 multipart abort；下载大文件时使用流式处理。",
    "- 新 APP 默认存储配额为 100 GiB；multipart init 必须提交完整文件的 `size_bytes`，并会跨区域预留该声明容量。",
    "- 空文件必须在客户端拒绝，不得发送 `size_bytes: 0`；默认分片为 5 MiB，非末片至少 5 MiB，单片不超过 64 MiB，总分片数不超过 10,000。",
    "- 分片大小应动态增大并按 MiB 对齐；默认策略最多支持 625 GiB，超出时必须在 init 前拒绝，或由管理员调整服务端策略。",
    "- 同一 `part_number` 可顺序重传；以最后一次成功上传的 ETag 和分片大小为准，不要并发重传同一编号。",
    "- multipart complete 或 abort 会释放会话的跨区域预留容量。",
    "- 收到业务码 `413049` 后停止上传且不要自动重试，提示用户联系应用管理员处理配额。",
    "- 收到业务码 `413050` 后不要原样重试；使用不超过 64 MiB 的分片重新切分。",
    "- 收到业务码 `401051`/`401052`/`403053` 后回到 App 后端重新签发能力令牌，不要重试原令牌。",
    "",
    "## 推荐流程",
    "",
    "1. 前端从 `/api/v1/public/endpoints` 获取候选 Storagent 地址，并调用 `/api/v1/public/endpoints/test` 选择可达、低时延节点（公共接口，无需任何凭据）。",
    "2. 前端向 App 后端发起上传请求；App 后端拒绝空文件后，用完整文件的 `size_bytes` 调用控制面 `multipart/init`，保存 `upload_id`/`object_key`，并签发分片上传能力令牌一并下发给前端。",
    "3. 前端携带令牌直连数据面 `multipart/part` 上传分片（不经过 App 后端转发数据）；以 5 MiB 为默认值，取配置分片与 `ceil(file_size / 10000)` 的较大值并向上对齐到 MiB，单片不超过 64 MiB、总片数不超过 10,000。",
    "4. 前端把全部分片的 `part_number`/`etag` 提交给 App 后端；App 后端调用控制面 `multipart/complete` 完成上传（失败且不可恢复时改为 `multipart/abort`），两者都会释放会话预留容量。",
    "5. 下载时前端向 App 后端申请下载凭据；App 后端校验业务权限后（可选调用控制面 `object/locate` 选定最佳节点），签发下载能力令牌并拼出最终 URL 返回给前端。",
    "6. 前端携带该 URL 直连数据面 `object/download` 流式下载，全程不接触 `x-api-key`。",
    "",
    "## 最小可运行上传/下载 Demo",
    "",
    "下面把推荐流程收成一份可直接照抄的最小 Demo（App 后端持有 `x-api-key` 并签发令牌；浏览器只拿 `part_token` / `download_url` 直连数据面）。",
    "实现前请先准备好上文的「能力令牌签发」与「App 后端公共请求封装」。若浏览器直连 part/download 出现 `TypeError: Failed to fetch`，先确认 Storagent 已把页面 Origin 加入 `BACKEND_CORS_ORIGINS` / `FRONT_URL`。",
    "",
    "### App 后端业务接口 · TypeScript",
    "",
    codeFence("typescript", API_GUIDE_MINIMAL_DEMO["app-ts"]),
    "",
    "### App 后端业务接口 · Python",
    "",
    codeFence("python", API_GUIDE_MINIMAL_DEMO["app-py"]),
    "",
    "### 浏览器前端 · 完整上传 + 下载",
    "",
    codeFence("typescript", API_GUIDE_MINIMAL_DEMO.browser),
    "",
    "### Demo 自检",
    "",
    "1. `POST /app/upload/init` 返回 `upload_id` / `object_key`（服务端生成）/ `part_token` / `part_url`，响应中**没有** `x-api-key`。",
    "2. 浏览器 Network 里 `multipart/part` 请求只有 `?token=`，没有 `x-api-key` 请求头。",
    "3. `POST /app/upload/complete` 后 `object/stat`（App 后端调用）能读到正确 `size`。",
    "4. `POST /app/download/url` 返回的 URL 含 `token=`；浏览器直连下载内容与上传文件一致。",
    "5. 空文件在 App 后端被 400 拒绝；超额 `size_bytes` 在控制面 init 返回 `413049`。",
    "",
    "## App 后端公共请求封装",
    "",
    "#### TypeScript",
    "",
    codeFence("typescript", API_GUIDE_SERVER_SETUP.typescript),
    "",
    "#### Python",
    "",
    codeFence("python", API_GUIDE_SERVER_SETUP.python),
    "",
    "## API 参考",
    "",
  ]

  const planeLabel: Record<ApiGuidePlane, string> = {
    public: "公共接口，无需任何凭据",
    control: "控制面 · 仅 App 后端可调用（`x-api-key`）",
    data: "数据面 · 浏览器前端应直连（`x-api-key` 或能力令牌 `token` 二选一）",
  }

  for (const endpoint of API_GUIDE_ENDPOINTS) {
    lines.push(
      `### ${endpoint.method} ${endpoint.path} - ${endpoint.summary}`,
      "",
      endpoint.description,
      "",
      `鉴权：${planeLabel[endpoint.plane]}`,
      "",
    )

    for (const section of endpoint.params) {
      lines.push(
        `#### ${section.title}`,
        "",
        markdownTable(
          ["字段", "类型", "必填", "说明"],
          section.rows.map((row) => [
            `\`${row.name}\``,
            row.type ? `\`${row.type}\`` : "-",
            row.required ? "是" : "否",
            row.description,
          ]),
        ),
        "",
      )
    }

    if (endpoint.notes?.length) {
      lines.push("#### 实现注意", "", ...endpoint.notes.map((note) => `- ${note}`), "")
    }

    const variantOrder: ApiGuideCodeVariant[] = ["server-ts", "server-py", "browser"]
    for (const variant of variantOrder) {
      const code = endpoint.examples[variant]
      if (!code) continue
      const meta = API_GUIDE_CODE_VARIANTS[variant]
      lines.push(`#### ${meta.label} 示例`, "", codeFence(meta.fence, code), "")
    }

    if (endpoint.response) {
      lines.push("#### 成功响应示例", "", codeFence("json", endpoint.response), "")
    }
  }

  lines.push(
    "## 错误处理与跨区域回退",
    "",
    "Storagent 的失败响应通常包含 `msg`、`data` 和稳定的业务 `code`。实现时同时检查 HTTP 状态与业务码。",
    "",
    markdownTable(["业务码", "含义", "建议处理"], API_GUIDE_ERROR_CODES.map((row) => [...row])),
    "",
    "#### TypeScript",
    "",
    codeFence("typescript", API_GUIDE_ERROR_EXAMPLES.typescript),
    "",
    "#### Python",
    "",
    codeFence("python", API_GUIDE_ERROR_EXAMPLES.python),
    "",
    "## 接入验收清单",
    "",
    "- [ ] `x-api-key` 只存在于 App 后端环境变量和 `x-api-key` 请求头中，浏览器前端从未持有过它。",
    "- [ ] 数据面接口（`multipart/part`、`object/download`）由浏览器前端直连，携带能力令牌 `token`，而不是 `x-api-key`。",
    "- [ ] 已按「最小可运行上传/下载 Demo」跑通：App init → 浏览器 part(token) → App complete → App 签发 download_url → 浏览器下载，内容校验一致。",
    "- [ ] 浏览器直连数据面时，页面 Origin 已加入 Storagent `BACKEND_CORS_ORIGINS` / `FRONT_URL`；未放行时不会把 CORS 失败误判为业务错误。",
    "- [ ] 分片上传令牌绑定 upload_id + object_key，建议 2 小时量级有效期；下载令牌绑定 object_key，建议 5-15 分钟量级有效期。",
    "- [ ] Base URL 会从候选节点中探测选择，并设置连接与读取超时。",
    "- [ ] 空文件在 init 前被拒绝；分片按 MiB 对齐，非末片至少 5 MiB、单片不超过 64 MiB、总片数不超过 10,000。",
    "- [ ] 默认策略下会在 init 前拒绝超过 625 GiB 的文件，并提示联系管理员调整策略。",
    "- [ ] 分片编号从 1 开始；同一编号重传后覆盖保存最新成功 ETag。",
    "- [ ] multipart init 的 `size_bytes` 等于完整源文件大小，而不是单个分片大小；已了解 init 会跨区域预留该容量。",
    "- [ ] 能识别 `413049`，停止重试并提示联系应用管理员调整配额或清理空间。",
    "- [ ] 能识别 `413050`，不原样重试超限分片，并按不超过 64 MiB 重新切分。",
    "- [ ] 能识别 `401051`/`401052`/`403053`，回 App 后端重新签发令牌，而不是重试原令牌。",
    "- [ ] 刷新或进程重启后可以用 parts 接口恢复上传（App 后端侧）。",
    "- [ ] 取消和不可恢复失败会调用 abort；complete 或 abort 后会话预留容量被释放。",
    "- [ ] stat 使用 POST JSON，且只在 App 后端调用；不把 APIKey 或 object_key 放入浏览器可见的 URL。",
    "- [ ] 能处理 `404032` 并从 `available_at` 选择可用节点。",
    "- [ ] 大文件下载采用流式转发或落盘，不整文件驻留内存。",
    "- [ ] 日志会脱敏请求头，不记录 `x-api-key` 或能力令牌明文。",
    "- [ ] 已覆盖成功、密钥失效、令牌过期/作用域不匹配、断点续传、跨节点回退和限流场景。",
    "",
  )

  return lines.join("\n")
}

// --- 版本登记表 ---
//
// 「功能接口引导」按业务接口版本分别打包内容，供 DocVersionSwitcher 切换（纯前端，
// 不发请求）。当前只有 v1；新增版本时在这里补一个 key，TypeScript 会在漏填时报错。

export type ApiGuideReleasedContent = {
  status: "released"
  version: string
  versionPrefix: string
  endpoints: ApiGuideEndpoint[]
  serverSetup: Record<"typescript" | "python", string>
  capabilityTokenCode: Record<"typescript" | "python", string>
  errorExamples: Record<"typescript" | "python", string>
  errorCodes: typeof API_GUIDE_ERROR_CODES
  generateMarkdown: () => string
}

export type ApiGuideDevelopingContent = {
  status: "developing"
  version: string
  summary: string
  highlights: string[]
}

export type ApiGuideVersionContent = ApiGuideReleasedContent | ApiGuideDevelopingContent

export const API_GUIDE_CONTENT_BY_VERSION: Record<DocVersion, ApiGuideVersionContent> = {
  v1: {
    status: "released",
    version: API_VERSION,
    versionPrefix: API_VERSION_PREFIX,
    endpoints: API_GUIDE_ENDPOINTS,
    serverSetup: API_GUIDE_SERVER_SETUP,
    capabilityTokenCode: API_GUIDE_CAPABILITY_TOKEN_CODE,
    errorExamples: API_GUIDE_ERROR_EXAMPLES,
    errorCodes: API_GUIDE_ERROR_CODES,
    generateMarkdown: generateApiGuideMarkdown,
  },
  v2: {
    status: "developing",
    version: "v2",
    summary: "v2 尚在设计阶段，正式发布前会在这里提供和 v1 同样完整的接口参考。",
    highlights: [
      "更细粒度的能力令牌作用域（例如按目录前缀、按操作次数限流）",
      "批量 / 目录级的对象操作接口",
      "更丰富的跨区域复制状态与一致性查询",
    ],
  },
}

export function getApiGuideContent(version: DocVersion): ApiGuideVersionContent {
  return API_GUIDE_CONTENT_BY_VERSION[version] ?? API_GUIDE_CONTENT_BY_VERSION[DEFAULT_DOC_VERSION]
}
