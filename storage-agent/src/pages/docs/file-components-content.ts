import {
  API_GUIDE_LANGUAGES,
  getApiGuideLanguage,
  type ApiGuideLanguage,
} from "./api-guide-content"

export type ComponentGuideLanguage = ApiGuideLanguage

export const COMPONENT_GUIDE_LANGUAGES = API_GUIDE_LANGUAGES

type ComponentGuideCode = {
  implementation: string
  usage: string
  implementationTitle: string
  usageTitle: string
  filename: string
}

export const COMPONENT_GUIDE_CODE: Record<ComponentGuideLanguage, ComponentGuideCode> = {
  typescript: {
    implementationTitle: "可直接引入的 React 组件",
    usageTitle: "页面调用示例",
    filename: "StoragentFiles.tsx",
    implementation: `import { useEffect, useMemo, useState } from "react"

type Location = {
  region: string
  shown_name: string
  endpoint: string
  download_url: string
}

type ObjectStat = {
  bucket: string
  object_key: string
  size: number
  etag: string
  content_type?: string | null
  last_modified?: string | null
  region?: string | null
  local?: boolean
}

type ApiErrorBody = {
  msg?: string
  code?: number
  data?: { available_at?: Location[] }
}

export type StoragentFilesProps = {
  baseURL: string
  apiKey: string
  defaultObjectKey?: string
  chunkSizeBytes?: number
  onUploaded?: (result: { bucket: string; objectKey: string }) => void
  onError?: (error: Error) => void
}

function joinURL(baseURL: string, path: string) {
  return \`\${baseURL.replace(/\\/+$/, "")}\${path}\`
}

async function readBody(response: Response) {
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { text, json }
}

function filenameFromObjectKey(objectKey: string) {
  return objectKey.split("/").filter(Boolean).pop() || "download.bin"
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function StoragentFiles({
  baseURL,
  apiKey,
  defaultObjectKey = "",
  chunkSizeBytes = 5 * 1024 * 1024,
  onUploaded,
  onError,
}: StoragentFilesProps) {
  const [file, setFile] = useState<File | null>(null)
  const [objectKey, setObjectKey] = useState(defaultObjectKey)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [stat, setStat] = useState<ObjectStat | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (defaultObjectKey) setObjectKey(defaultObjectKey)
  }, [defaultObjectKey])

  const ready = useMemo(
    () => Boolean(baseURL && apiKey && !busy),
    [apiKey, baseURL, busy],
  )

  const fail = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    setMessage(error.message)
    onError?.(error)
  }

  const requestJSON = async <T,>(path: string, init: RequestInit): Promise<T> => {
    const response = await fetch(joinURL(baseURL, path), {
      ...init,
      headers: { "x-api-key": apiKey, ...(init.headers ?? {}) },
    })
    const body = await readBody(response)
    if (!response.ok) {
      const error = new Error(
        (body.json as ApiErrorBody | null)?.msg || body.text || \`HTTP \${response.status}\`,
      ) as Error & { status?: number; body?: ApiErrorBody | null }
      error.status = response.status
      error.body = body.json as ApiErrorBody | null
      throw error
    }
    return body.json as T
  }

  const upload = async () => {
    if (!file || !ready) return
    setBusy(true)
    setMessage("")
    setProgress(null)
    let initialized: { upload_id: string; object_key: string } | null = null

    try {
      initialized = await requestJSON<{ upload_id: string; object_key: string }>("/api/files/multipart/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: file.type || "application/octet-stream" }),
      })

      const total = Math.max(1, Math.ceil(file.size / chunkSizeBytes))
      const parts: Array<{ part_number: number; etag: string }> = []
      setProgress({ done: 0, total })

      for (let partNumber = 1; partNumber <= total; partNumber += 1) {
        const start = (partNumber - 1) * chunkSizeBytes
        const form = new FormData()
        form.set("upload_id", initialized.upload_id)
        form.set("object_key", initialized.object_key)
        form.set("part_number", String(partNumber))
        form.set("file", file.slice(start, Math.min(file.size, start + chunkSizeBytes)), file.name)

        const part = await requestJSON<{ part_number: number; etag: string }>(
          "/api/files/multipart/part",
          { method: "POST", body: form },
        )
        parts.push({ part_number: part.part_number, etag: part.etag.replace(/^"+|"+$/g, "") })
        setProgress({ done: partNumber, total })
      }

      const completed = await requestJSON<{ bucket: string; object_key: string }>(
        "/api/files/multipart/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_id: initialized.upload_id,
            object_key: initialized.object_key,
            parts: parts.sort((a, b) => a.part_number - b.part_number),
          }),
        },
      )
      setObjectKey(completed.object_key)
      setMessage(\`上传完成：\${completed.object_key}\`)
      onUploaded?.({ bucket: completed.bucket, objectKey: completed.object_key })
    } catch (error) {
      if (initialized) {
        void requestJSON("/api/files/multipart/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(initialized),
        }).catch(() => undefined)
      }
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const getStat = async () => {
    if (!objectKey.trim() || !ready) return
    setBusy(true)
    setMessage("")
    setLocations([])
    try {
      const result = await requestJSON<ObjectStat>("/api/files/object/stat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object_key: objectKey.trim() }),
      })
      setStat(result)
    } catch (error) {
      const remote = (error as Error & { body?: ApiErrorBody }).body?.data?.available_at
      if (remote?.length) setLocations(remote)
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const locate = async () => {
    if (!objectKey.trim() || !ready) return
    setBusy(true)
    setMessage("")
    try {
      const query = new URLSearchParams({ object_key: objectKey.trim(), offset: "0", length: "0" })
      const result = await requestJSON<{ available_at: Location[] }>(
        \`/api/files/object/locate?\${query}\`,
        { method: "GET" },
      )
      setLocations(result.available_at)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const download = async (downloadURL?: string) => {
    if (!objectKey.trim() || !ready) return
    setBusy(true)
    setMessage("")
    try {
      const query = new URLSearchParams({ object_key: objectKey.trim(), offset: "0", length: "0" })
      const response = await fetch(
        downloadURL || joinURL(baseURL, \`/api/files/object/download?\${query}\`),
        { headers: { "x-api-key": apiKey } },
      )
      if (!response.ok) {
        const body = await readBody(response)
        const remote = (body.json as ApiErrorBody | null)?.data?.available_at
        if (remote?.length) {
          setLocations(remote)
          setMessage("当前节点没有该对象，请选择可用服务点下载")
          return
        }
        throw new Error((body.json as ApiErrorBody | null)?.msg || body.text || \`HTTP \${response.status}\`)
      }
      saveBlob(await response.blob(), filenameFromObjectKey(objectKey))
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Storagent 文件组件" className="storagent-files">
      <fieldset disabled={!ready}>
        <legend>上传文件</legend>
        <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button type="button" disabled={!file || !ready} onClick={() => void upload()}>
          {busy ? "处理中..." : "开始上传"}
        </button>
        {progress ? <progress value={progress.done} max={progress.total} /> : null}
      </fieldset>

      <fieldset disabled={!ready}>
        <legend>查询与下载</legend>
        <input
          value={objectKey}
          placeholder="object_key"
          onChange={(event) => setObjectKey(event.target.value)}
        />
        <button type="button" onClick={() => void getStat()}>获取元信息</button>
        <button type="button" onClick={() => void locate()}>定位服务点</button>
        <button type="button" onClick={() => void download()}>下载</button>
      </fieldset>

      {message ? <p role="status">{message}</p> : null}
      {stat ? <pre>{JSON.stringify(stat, null, 2)}</pre> : null}
      {locations.length ? (
        <ul>
          {locations.map((location) => (
            <li key={location.endpoint}>
              {location.shown_name} ({location.region})
              <button type="button" onClick={() => void download(location.download_url)}>
                从此节点下载
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}`,
    usage: `import { StoragentFiles } from "./StoragentFiles"

export function FilesPage() {
  return (
    <StoragentFiles
      baseURL={import.meta.env.VITE_STORAGENT_BASE_URL}
      apiKey={import.meta.env.VITE_STORAGENT_API_KEY}
      onUploaded={({ objectKey }) => console.log("object_key:", objectKey)}
      onError={(error) => console.error(error)}
    />
  )
}`,
  },
  python: {
    implementationTitle: "可直接引入的客户端类",
    usageTitle: "业务模块调用示例",
    filename: "storagent_files.py",
    implementation: `from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any, Literal, overload

import requests


class StoragentError(RuntimeError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        super().__init__((body or {}).get("msg") or f"Storagent HTTP {status}")


class StoragentFilesClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        chunk_size: int = 5 * 1024 * 1024,
        timeout: int = 60,
        session: requests.Session | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.chunk_size = chunk_size
        self.timeout = timeout
        self.session = session or requests.Session()
        self.session.headers.update({"x-api-key": api_key})

    def _request(self, method: str, path_or_url: str, **kwargs: Any) -> requests.Response:
        url = path_or_url if path_or_url.startswith(("http://", "https://")) else self.base_url + path_or_url
        response = self.session.request(method, url, timeout=self.timeout, **kwargs)
        if response.ok:
            return response
        try:
            body = response.json()
        except ValueError:
            body = {"msg": response.text} if response.text else None
        raise StoragentError(response.status_code, body)

    def _json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        return self._request(method, path, **kwargs).json()

    @overload
    def upload_file(self, file_path: str | Path, *, return_json: Literal[False] = False) -> str: ...

    @overload
    def upload_file(self, file_path: str | Path, *, return_json: Literal[True]) -> dict[str, Any]: ...

    def upload_file(
        self,
        file_path: str | Path,
        *,
        content_type: str | None = None,
        return_json: bool = False,
    ) -> str | dict[str, Any]:
        path = Path(file_path)
        mime = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        initialized = self._json(
            "POST",
            "/api/files/multipart/init",
            json={"content_type": mime},
        )
        parts: list[dict[str, Any]] = []

        try:
            with path.open("rb") as source:
                part_number = 1
                while True:
                    chunk = source.read(self.chunk_size)
                    if not chunk and part_number > 1:
                        break
                    response = self._json(
                        "POST",
                        "/api/files/multipart/part",
                        files={"file": (path.name, chunk, mime)},
                        data={
                            "upload_id": initialized["upload_id"],
                            "object_key": initialized["object_key"],
                            "part_number": str(part_number),
                        },
                    )
                    parts.append({
                        "part_number": response["part_number"],
                        "etag": response["etag"].strip(chr(34)),
                    })
                    part_number += 1

            completed = self._json(
                "POST",
                "/api/files/multipart/complete",
                json={
                    "upload_id": initialized["upload_id"],
                    "object_key": initialized["object_key"],
                    "parts": sorted(parts, key=lambda item: item["part_number"]),
                },
            )
            return completed if return_json else completed["object_key"]
        except Exception:
            try:
                self._json(
                    "POST",
                    "/api/files/multipart/abort",
                    json={
                        "upload_id": initialized["upload_id"],
                        "object_key": initialized["object_key"],
                    },
                )
            except Exception:
                pass
            raise

    def stat_object(self, object_key: str) -> dict[str, Any]:
        return self._json(
            "POST",
            "/api/files/object/stat",
            json={"object_key": object_key},
        )

    def locate_object(self, object_key: str) -> dict[str, Any]:
        return self._json(
            "GET",
            "/api/files/object/locate",
            params={"object_key": object_key, "offset": 0, "length": 0},
        )

    def download_object(self, object_key: str, output_path: str | Path) -> dict[str, Any]:
        location: dict[str, Any] | None = None
        try:
            metadata = self.stat_object(object_key)
        except StoragentError as error:
            if error.body and error.body.get("code") == 404032:
                available = (error.body.get("data") or {}).get("available_at") or []
                if not available:
                    available = self.locate_object(object_key).get("available_at", [])
                if not available:
                    raise FileNotFoundError(object_key) from error
                location = available[0]
                metadata = {"object_key": object_key}
            else:
                raise

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if location:
            response = self._request("GET", location["download_url"], stream=True)
        else:
            response = self._request(
                "GET",
                "/api/files/object/download",
                params={"object_key": object_key, "offset": 0, "length": 0},
                stream=True,
            )

        with path.open("wb") as target:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    target.write(chunk)

        return {
            "object_key": object_key,
            "output_path": str(path),
            "metadata": metadata,
            "source": location,
        }

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "StoragentFilesClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()`,
    usage: `import os

from storagent_files import StoragentFilesClient


with StoragentFilesClient(
    os.environ["STORAGENT_BASE_URL"],
    os.environ["STORAGENT_API_KEY"],
) as files:
    object_key = files.upload_file("./example.bin")
    print("object_key:", object_key)

    upload_result = files.upload_file("./report.pdf", return_json=True)
    print("upload result:", upload_result)

    metadata = files.stat_object(object_key)
    download_result = files.download_object(object_key, "./downloads/example.bin")
    print("metadata:", metadata)
    print("download result:", download_result)`,
  },
}

function markdownFence(language: string, code: string) {
  return "```" + language + "\n" + code.trim() + "\n```"
}

export function generateComponentGuideMarkdown(language: ComponentGuideLanguage) {
  const meta = getApiGuideLanguage(language)
  const code = COMPONENT_GUIDE_CODE[language]
  const isTypeScript = language === "typescript"
  return [
    "# Storagent 文件组件接入指南",
    "",
    `> 示例语言：${meta.label}；产出文件：\`${code.filename}\`；运行环境：${meta.runtime}。`,
    "",
    "## 给开发者与 AI 的实施目标",
    "",
    isTypeScript
      ? "将完整组件文件加入 React 项目后直接引入。组件覆盖文件选择、分片上传、object_key 回填、元信息查询、服务点定位、当前节点下载与跨区域回退下载。"
      : "将客户端类文件加入 Python 项目后直接实例化。类对外提供上传、元信息、定位和下载方法；上传可返回 object_key 或完整 JSON，下载返回结果字典。",
    "",
    "## 安全约束",
    "",
    "- APIKey 只使用 `x-api-key` 请求头，不得放入 URL 或日志。",
    "- `stat` 使用 POST JSON；`locate` 与 `download` 的 object_key 使用标准 URL 编码。",
    "- 上传异常时调用 multipart abort；下载大文件采用流式处理。",
    isTypeScript
      ? "- 浏览器组件适合可信内网或临时演示。互联网生产系统应由业务服务端代持 APIKey。"
      : "- APIKey 应由服务端环境变量或密钥管理系统注入。",
    "",
    "## 安装与文件位置",
    "",
    `- 运行环境：${meta.runtime}`,
    `- 依赖：${meta.dependency}`,
    `- 建议文件名：\`${code.filename}\``,
    "",
    `## ${code.implementationTitle}`,
    "",
    markdownFence(meta.fence, code.implementation),
    "",
    `## ${code.usageTitle}`,
    "",
    markdownFence(meta.fence, code.usage),
    "",
    "## 接入验收清单",
    "",
    "- [ ] APIKey 只进入 `x-api-key` 请求头。",
    "- [ ] 上传保存 upload_id、object_key、part_number 与 ETag，失败时执行 abort。",
    "- [ ] 上传结果可供外部业务模块取得 object_key 或完整响应。",
    "- [ ] stat 使用 POST JSON，能够处理业务码 404032。",
    "- [ ] 当前节点无副本时能从 available_at 选择节点继续下载。",
    "- [ ] 下载结果可被外部业务模块继续处理。",
    "",
  ].join("\n")
}
