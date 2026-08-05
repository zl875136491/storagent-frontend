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

export type ApiGuideEndpoint = {
  id: string
  method: "GET" | "POST"
  path: string
  summary: string
  description: string
  authentication: "public" | "api-key"
  params: ApiGuideParamSection[]
  notes?: string[]
  examples: Record<ApiGuideLanguage, string>
  response?: string
}

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

const apiKeyHeaders = (contentType?: string): ApiGuideParamSection => ({
  title: "Headers",
  rows: [
    {
      name: "x-api-key",
      type: "string",
      required: true,
      description: "控制台签发的业务 APIKey。只放请求头，不得放入 URL、日志或浏览器前端包。",
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

export const API_GUIDE_SETUP: Record<ApiGuideLanguage, string> = {
  typescript: `const BASE_URL = (process.env.STORAGENT_BASE_URL ?? "").replace(/\\/+$/, "")
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
  python: `import os
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

export const API_GUIDE_ERROR_EXAMPLES: Record<ApiGuideLanguage, string> = {
  typescript: `try {
  const response = await storagentFetch("/api/files/object/stat", {
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
        "/api/files/object/stat",
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

export const API_GUIDE_ENDPOINTS: ApiGuideEndpoint[] = [
  {
    id: "endpoints-list",
    method: "GET",
    path: "/api/public/endpoints",
    summary: "列出服务端点",
    description: "返回所有区域的 Storagent 与 MinIO 地址。应用可探测各 Storagent endpoint，并选择低时延节点作为 Base URL。",
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
    notes: ["该接口无需 APIKey。业务接入应调用 Storagent endpoint，不要直接使用 MinIO 凭据。"],
    examples: {
      typescript: `type Endpoint = {
  region_id: string
  server_id: string
  name: string
  shown_name: string
  master: boolean
  endpoint: string
  minio_endpoint: string
}

const response = await storagentFetch("/api/public/endpoints", {}, false)
const { data } = (await response.json()) as { data: Endpoint[] }
console.table(data.map(({ name, endpoint, master }) => ({ name, endpoint, master })))`,
      python: `response = storagent_request("GET", "/api/public/endpoints", authenticated=False)
for endpoint in response.json()["data"]:
    print(endpoint["name"], endpoint["endpoint"], endpoint["master"])`,
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
    path: "/api/public/endpoints/test",
    summary: "探测端点延迟",
    description: "返回 512 字节随机二进制，避免缓存干扰。对候选 endpoint 并发探测，优先选择可达且耗时最低的节点。",
    authentication: "public",
    params: [],
    notes: ["响应类型为 application/octet-stream，不是 JSON。生产实现应设置超时，并定期重新探测。"],
    examples: {
      typescript: `const startedAt = performance.now()
const response = await storagentFetch("/api/public/endpoints/test", {}, false)
const payload = new Uint8Array(await response.arrayBuffer())
console.log({ bytes: payload.byteLength, elapsedMs: performance.now() - startedAt })`,
      python: `from time import perf_counter

started_at = perf_counter()
response = storagent_request("GET", "/api/public/endpoints/test", authenticated=False)
print({"bytes": len(response.content), "elapsed_ms": (perf_counter() - started_at) * 1000})`,
    },
  },
  {
    id: "multipart-init",
    method: "POST",
    path: "/api/files/multipart/init",
    summary: "初始化分片上传",
    description: "创建 multipart 会话并由服务端生成 object_key。请求必须声明完整文件字节数，服务端会在创建会话前跨区域检查 APP 存储配额，并按 size_bytes 预留声明容量；新 APP 默认配额为 100 GiB。",
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
      typescript: `import { stat } from "node:fs/promises"

type MultipartInit = { upload_id: string; bucket: string; object_key: string }

const source = await stat("./document.pdf")
if (source.size <= 0) throw new Error("空文件暂不支持上传，请选择包含内容的文件")

const response = await storagentFetch("/api/files/multipart/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content_type: "application/pdf", size_bytes: source.size }),
})
const upload = (await response.json()) as MultipartInit
console.log(upload)`,
      python: `from pathlib import Path

source = Path("./document.pdf")
if source.stat().st_size <= 0:
    raise ValueError("空文件暂不支持上传，请选择包含内容的文件")
response = storagent_request(
    "POST",
    "/api/files/multipart/init",
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
    path: "/api/files/multipart/part",
    summary: "上传单个分片",
    description: "以 multipart/form-data 上传一个分片。part_number 从 1 开始且最多为 10,000；默认分片为 5 MiB，客户端应取配置值与 ceil(文件大小 / 10000) 的较大值并向上对齐到 MiB。除最后一片外至少 5 MiB，单片不得超过服务端默认上限 64 MiB；因此默认策略最多支持 625 GiB。同一 part_number 可在网络或校验失败后重传，最后一次成功上传的 ETag 和分片大小生效。",
    authentication: "api-key",
    params: [
      apiKeyHeaders("multipart/form-data；由客户端自动附加 boundary，不要手动设置该请求头"),
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
      "可以并发上传不同 part_number；不要并发重传同一编号，应在前一次失败后顺序执行有限次数重试。",
      "每次重传成功后覆盖业务侧保存的 ETag；parts 查询中该 part_number 的 ETag 和 size 也以最后一次成功上传为准。",
      "业务码 413050 表示当前分片超过 64 MiB；不要重试相同负载，应使用合规大小重新切分。超过 625 GiB 的文件在默认策略下应于 init 前拒绝。",
    ],
    examples: {
      typescript: `import { readFile } from "node:fs/promises"

const bytes = new Uint8Array(await readFile("./part-1.bin"))
const MAX_UPLOAD_PART_BYTES = 64 * 1024 * 1024
if (bytes.byteLength > MAX_UPLOAD_PART_BYTES) {
  throw new Error("分片超过服务端默认上限 64 MiB，请重新切分")
}
const form = new FormData()
form.set("upload_id", upload.upload_id)
form.set("object_key", upload.object_key)
form.set("part_number", "1")
form.set("file", new Blob([bytes]), "part-1.bin")

const response = await storagentFetch("/api/files/multipart/part", {
  method: "POST",
  body: form,
})
const part = (await response.json()) as { part_number: number; etag: string }
console.log(part)`,
      python: `from pathlib import Path

part_path = Path("part-1.bin")
MAX_UPLOAD_PART_BYTES = 64 * 1024 * 1024
if part_path.stat().st_size > MAX_UPLOAD_PART_BYTES:
    raise ValueError("分片超过服务端默认上限 64 MiB，请重新切分")

with part_path.open("rb") as part_file:
    response = storagent_request(
        "POST",
        "/api/files/multipart/part",
        data={
            "upload_id": upload["upload_id"],
            "object_key": upload["object_key"],
            "part_number": 1,
        },
        files={"file": ("part-1.bin", part_file, "application/octet-stream")},
    )
part = response.json()
print(part)`,
    },
    response: `{
  "part_number": 1,
  "etag": "b1946ac92492d2347c6235b4d2611184"
}`,
  },
  {
    id: "multipart-parts",
    method: "GET",
    path: "/api/files/multipart/parts",
    summary: "查询已上传分片",
    description: "恢复中断上传前查询服务端已接收的分片，避免不必要的重传。同一 part_number 如曾重传，返回最后一次成功上传的 ETag 和 size。每次最多返回 1000 条，可用 part_number_marker 继续翻页。",
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
      typescript: `const query = new URLSearchParams({
  upload_id: upload.upload_id,
  object_key: upload.object_key,
})
const response = await storagentFetch(\`/api/files/multipart/parts?\${query}\`)
const result = (await response.json()) as {
  upload_id: string
  parts: Array<{ part_number: number; etag: string; size?: number }>
}
console.table(result.parts)`,
      python: `response = storagent_request(
    "GET",
    "/api/files/multipart/parts",
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
    path: "/api/files/multipart/complete",
    summary: "完成分片上传",
    description: "提交全部分片编号和各编号最后一次成功上传的 ETag，服务端按 part_number 排序并合并对象。只有此接口成功后，对象才算完成上传，同时释放 init 为该会话创建的跨区域预留容量。",
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
      typescript: `const uploadedParts = [{ part_number: part.part_number, etag: part.etag }]
const response = await storagentFetch("/api/files/multipart/complete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    upload_id: upload.upload_id,
    object_key: upload.object_key,
    parts: uploadedParts,
  }),
})
console.log(await response.json())`,
      python: `uploaded_parts = [{"part_number": part["part_number"], "etag": part["etag"]}]
response = storagent_request(
    "POST",
    "/api/files/multipart/complete",
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
    path: "/api/files/multipart/abort",
    summary: "中止分片上传",
    description: "用户取消或上传无法恢复时释放未完成的 multipart 会话、残留分片和 init 为该会话创建的跨区域预留容量。",
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
      typescript: `const response = await storagentFetch("/api/files/multipart/abort", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    upload_id: upload.upload_id,
    object_key: upload.object_key,
  }),
})
console.log(await response.json())`,
      python: `response = storagent_request(
    "POST",
    "/api/files/multipart/abort",
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
    path: "/api/files/object/stat",
    summary: "获取对象元信息",
    description: "读取对象大小、ETag、类型和所在区域，用于下载规划或完整性检查。object_key 与 APIKey 均不进入 URL。",
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
      typescript: `const response = await storagentFetch("/api/files/object/stat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ object_key: "path/to/file.bin" }),
})
console.log(await response.json())`,
      python: `response = storagent_request(
    "POST",
    "/api/files/object/stat",
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
    path: "/api/files/object/download",
    summary: "下载对象或字节区间",
    description: "流式读取整个对象，或通过 offset/length 获取固定字节区间。length 为 0 时从 offset 读取到文件末尾。",
    authentication: "api-key",
    params: [
      apiKeyHeaders(),
      {
        title: "Query",
        rows: [
          { name: "object_key", type: "string", required: true, description: "对象键" },
          { name: "offset", type: "integer", description: "起始字节，默认 0" },
          { name: "length", type: "integer", description: "读取长度；0 表示读到末尾" },
        ],
      },
    ],
    notes: ["响应为二进制；length > 0 时可能返回 206。大文件不要一次性读入内存，应将响应流直接传给文件或下游响应。"],
    examples: {
      typescript: `import { open } from "node:fs/promises"

const query = new URLSearchParams({
  object_key: "path/to/file.bin",
  offset: "0",
  length: "0",
})
const response = await storagentFetch(\`/api/files/object/download?\${query}\`)
if (!response.body) throw new Error("下载响应没有数据流")

const output = await open("./download.bin", "w")
try {
  for await (const chunk of response.body) {
    await output.write(chunk)
  }
} finally {
  await output.close()
}`,
      python: `with storagent_request(
    "GET",
    "/api/files/object/download",
    params={"object_key": "path/to/file.bin", "offset": 0, "length": 0},
    stream=True,
) as response:
    with open("download.bin", "wb") as output:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                output.write(chunk)`,
    },
  },
  {
    id: "object-locate",
    method: "GET",
    path: "/api/files/object/locate",
    summary: "定位对象所在节点",
    description: "扫描各服务点并返回对象实际存在的位置。用于主动选择就近下载节点，不应在每次普通下载前无条件调用。",
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
    notes: ["该接口需要跨节点探测并带有频控。返回的 stat_url 使用 POST，仍需携带相同 x-api-key 与 stat_body。"],
    examples: {
      typescript: `const query = new URLSearchParams({ object_key: "path/to/file.bin" })
const response = await storagentFetch(\`/api/files/object/locate?\${query}\`)
const location = (await response.json()) as {
  current_region: string
  local_exists: boolean
  available_at: Array<{ region: string; endpoint: string; download_url: string }>
}
console.table(location.available_at)`,
      python: `response = storagent_request(
    "GET",
    "/api/files/object/locate",
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
      "stat_url": "https://bj.example.com/api/files/object/stat",
      "stat_method": "POST",
      "stat_body": { "object_key": "path/to/file.bin" },
      "download_url": "https://bj.example.com/api/files/object/download?object_key=path%2Fto%2Ffile.bin&offset=0&length=0"
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

export function generateApiGuideMarkdown(language: ApiGuideLanguage) {
  const meta = getApiGuideLanguage(language)
  const lines: string[] = [
    "# Storagent 存储 API 接入指南",
    "",
    `> 示例语言：${meta.label}；运行环境：${meta.runtime}。本文由 Storagent 控制台的结构化接口定义生成。`,
    "",
    "## 给开发者与 AI 的实施目标",
    "",
    "使用本文为业务系统实现 Storagent 文件上传、断点续传、元信息查询、跨区域定位和流式下载。生成实现时必须保留这里给出的 HTTP 方法、路径、鉴权位置和字段名。",
    "",
    "### 不可违反的安全约束",
    "",
    "- `x-api-key` 只能由服务端持有，并通过请求头发送。",
    "- 不得把 APIKey 放入 query、URL、浏览器代码、移动端包、日志或异常信息。",
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
    "",
    "## 接入流程",
    "",
    "1. 从 `/api/public/endpoints` 获取候选 Storagent 地址。",
    "2. 调用 `/api/public/endpoints/test` 并选择可达、低时延节点。",
    "3. 拒绝空文件；使用非空文件的实际字节数作为 `size_bytes` 初始化 multipart，跨区域预留声明容量后保存 `upload_id` 和 `object_key`。",
    "4. 以 5 MiB 为默认值，取配置分片与 `ceil(file_size / 10000)` 的较大值并向上对齐到 MiB；确保单片不超过 64 MiB、总片数不超过 10,000，上传时保存每片 `part_number` 与最新 `etag`。",
    "5. 提交全部分片完成上传；失败且不可恢复时中止会话。complete 或 abort 都会释放会话预留容量。",
    "6. 使用 POST stat 查询元信息；当前节点没有对象时按 `404032` 的 `available_at` 回退。",
    "7. 使用 download 流式读取；需要主动选点时再调用 locate。",
    "",
    "## 环境与公共请求封装",
    "",
    `- 运行环境：${meta.runtime}`,
    `- 依赖：${meta.dependency}`,
    "- 环境变量：`STORAGENT_BASE_URL`、`STORAGENT_API_KEY`",
    "",
    codeFence(meta.fence, API_GUIDE_SETUP[language]),
    "",
    "## API 参考",
    "",
  ]

  for (const endpoint of API_GUIDE_ENDPOINTS) {
    lines.push(
      `### ${endpoint.method} ${endpoint.path} - ${endpoint.summary}`,
      "",
      endpoint.description,
      "",
      `鉴权：${endpoint.authentication === "public" ? "公共接口，无需 APIKey" : "请求头 `x-api-key`"}`,
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

    lines.push(`#### ${meta.label} 示例`, "", codeFence(meta.fence, endpoint.examples[language]), "")
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
    codeFence(meta.fence, API_GUIDE_ERROR_EXAMPLES[language]),
    "",
    "## 接入验收清单",
    "",
    "- [ ] APIKey 只存在服务端环境变量和 `x-api-key` 请求头中。",
    "- [ ] Base URL 会从候选节点中探测选择，并设置连接与读取超时。",
    "- [ ] 空文件在 init 前被拒绝；分片按 MiB 对齐，非末片至少 5 MiB、单片不超过 64 MiB、总片数不超过 10,000。",
    "- [ ] 默认策略下会在 init 前拒绝超过 625 GiB 的文件，并提示联系管理员调整策略。",
    "- [ ] 分片编号从 1 开始；同一编号重传后覆盖保存最新成功 ETag。",
    "- [ ] multipart init 的 `size_bytes` 等于完整源文件大小，而不是单个分片大小；已了解 init 会跨区域预留该容量。",
    "- [ ] 能识别 `413049`，停止重试并提示联系应用管理员调整配额或清理空间。",
    "- [ ] 能识别 `413050`，不原样重试超限分片，并按不超过 64 MiB 重新切分。",
    "- [ ] 刷新或进程重启后可以用 parts 接口恢复上传。",
    "- [ ] 取消和不可恢复失败会调用 abort；complete 或 abort 后会话预留容量被释放。",
    "- [ ] stat 使用 POST JSON，不把 APIKey 或 object_key 放入 stat URL。",
    "- [ ] 能处理 `404032` 并从 `available_at` 选择可用节点。",
    "- [ ] 大文件下载采用流式转发或落盘，不整文件驻留内存。",
    "- [ ] 日志会脱敏请求头，不记录 APIKey。",
    "- [ ] 已覆盖成功、密钥失效、断点续传、跨节点回退和限流场景。",
    "",
  )

  return lines.join("\n")
}
