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
    implementation: `import { useEffect, useMemo, useRef, useState } from "react"

type Location = {
  region: string
  shown_name: string
  endpoint: string
  stat_url: string
  stat_body: { object_key: string }
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

export class QuotaExceededError extends Error {
  readonly code = 413049
  readonly status: number
  readonly body: ApiErrorBody | null

  constructor(status: number, body: ApiErrorBody | null) {
    super("APP 存储超出限额，请联系管理员处理")
    this.name = "QuotaExceededError"
    this.status = status
    this.body = body
  }
}

export type DownloadProgress = {
  status: "downloading" | "completed" | "cancelled"
  receivedBytes: number
  totalBytes: number | null
  speedBytesPerSecond: number
}

export type StoragentFilesProps = {
  baseURL: string
  apiKey: string
  defaultObjectKey?: string
  chunkSizeBytes?: number
  onUploaded?: (result: { bucket: string; objectKey: string }) => void
  onDownloadProgress?: (progress: DownloadProgress) => void
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

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return \`\${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} \${units[index]}\`
}

const MIB = 1024 * 1024
const DEFAULT_CHUNK_SIZE = 5 * MIB
const MAX_MULTIPART_PARTS = 10_000
const EMPTY_FILE_ERROR = "空文件暂不支持上传，请选择包含内容的文件"

function multipartChunkSize(fileSize: number, configuredSize: number) {
  const safeConfiguredSize = Number.isFinite(configuredSize) && configuredSize > 0
    ? configuredSize
    : DEFAULT_CHUNK_SIZE
  const requiredSize = Math.ceil(fileSize / MAX_MULTIPART_PARTS)
  return Math.ceil(Math.max(safeConfiguredSize, requiredSize) / MIB) * MIB
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
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
  onDownloadProgress,
  onError,
}: StoragentFilesProps) {
  const [file, setFile] = useState<File | null>(null)
  const [objectKey, setObjectKey] = useState(defaultObjectKey)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [stat, setStat] = useState<ObjectStat | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [message, setMessage] = useState("")
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const downloadProgressRef = useRef<DownloadProgress | null>(null)
  const downloadAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (defaultObjectKey) setObjectKey(defaultObjectKey)
  }, [defaultObjectKey])

  useEffect(() => () => downloadAbortRef.current?.abort(), [])

  const configured = useMemo(() => Boolean(baseURL && apiKey), [apiKey, baseURL])
  const ready = configured && !busy

  const fail = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    setMessage(error.message)
    onError?.(error)
  }

  const requestJSON = async <T,>(pathOrURL: string, init: RequestInit): Promise<T> => {
    const url = pathOrURL.startsWith("http") ? pathOrURL : joinURL(baseURL, pathOrURL)
    const response = await fetch(url, {
      ...init,
      headers: { "x-api-key": apiKey, ...(init.headers ?? {}) },
    })
    const body = await readBody(response)
    if (!response.ok) {
      const errorBody = body.json as ApiErrorBody | null
      if (errorBody?.code === 413049) {
        throw new QuotaExceededError(response.status, errorBody)
      }
      const error = new Error(
        errorBody?.msg || body.text || \`HTTP \${response.status}\`,
      ) as Error & { status?: number; body?: ApiErrorBody | null }
      error.status = response.status
      error.body = errorBody
      throw error
    }
    return body.json as T
  }

  const upload = async () => {
    if (!file || !ready) return
    if (file.size <= 0) {
      fail(new Error(EMPTY_FILE_ERROR))
      return
    }
    const chunkSize = multipartChunkSize(file.size, chunkSizeBytes)
    setBusy(true)
    setMessage("")
    setProgress(null)
    let initialized: { upload_id: string; object_key: string } | null = null

    try {
      initialized = await requestJSON<{ upload_id: string; object_key: string }>("/api/files/multipart/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        }),
      })

      const total = Math.ceil(file.size / chunkSize)
      const parts: Array<{ part_number: number; etag: string }> = []
      setProgress({ done: 0, total })

      for (let partNumber = 1; partNumber <= total; partNumber += 1) {
        const start = (partNumber - 1) * chunkSize
        const form = new FormData()
        form.set("upload_id", initialized.upload_id)
        form.set("object_key", initialized.object_key)
        form.set("part_number", String(partNumber))
        form.set("file", file.slice(start, Math.min(file.size, start + chunkSize)), file.name)

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

  const publishDownloadProgress = (next: DownloadProgress) => {
    downloadProgressRef.current = next
    setDownloadProgress(next)
    onDownloadProgress?.(next)
  }

  const download = async (location?: Location) => {
    if (!objectKey.trim() || !configured || busy) return
    const controller = new AbortController()
    downloadAbortRef.current = controller
    setBusy(true)
    setMessage("")
    publishDownloadProgress({
      status: "downloading",
      receivedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: 0,
    })
    try {
      const query = new URLSearchParams({ object_key: objectKey.trim(), offset: "0", length: "0" })
      const metadata = await requestJSON<ObjectStat>(
        location?.stat_url || "/api/files/object/stat",
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(location?.stat_body || { object_key: objectKey.trim() }),
        },
      )
      const totalBytes = metadata.size
      const response = await fetch(
        location?.download_url || joinURL(baseURL, \`/api/files/object/download?\${query}\`),
        { signal: controller.signal, headers: { "x-api-key": apiKey } },
      )
      if (!response.ok) {
        const body = await readBody(response)
        const remote = (body.json as ApiErrorBody | null)?.data?.available_at
        if (remote?.length) {
          setLocations(remote)
          setMessage("当前节点没有该对象，请选择可用服务点下载")
          setDownloadProgress(null)
          downloadProgressRef.current = null
          return
        }
        throw new Error((body.json as ApiErrorBody | null)?.msg || body.text || \`HTTP \${response.status}\`)
      }
      if (!response.body) throw new Error("当前浏览器不支持流式下载进度")

      const reader = response.body.getReader()
      const chunks: BlobPart[] = []
      const startedAt = performance.now()
      let lastAt = startedAt
      let lastBytes = 0
      let receivedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value.slice().buffer)
        receivedBytes += value.byteLength
        const now = performance.now()
        if (lastBytes === 0 || now - lastAt >= 250) {
          const speed = ((receivedBytes - lastBytes) * 1000) / Math.max(1, now - lastAt)
          publishDownloadProgress({
            status: "downloading",
            receivedBytes,
            totalBytes,
            speedBytesPerSecond: speed,
          })
          lastAt = now
          lastBytes = receivedBytes
        }
      }

      const averageSpeed = (receivedBytes * 1000) / Math.max(1, performance.now() - startedAt)
      if (controller.signal.aborted) throw new DOMException("Download cancelled", "AbortError")
      saveBlob(
        new Blob(chunks, { type: response.headers.get("Content-Type") || "application/octet-stream" }),
        filenameFromObjectKey(objectKey),
      )
      publishDownloadProgress({
        status: "completed",
        receivedBytes,
        totalBytes,
        speedBytesPerSecond: averageSpeed,
      })
    } catch (error) {
      if (isAbortError(error)) {
        const current = downloadProgressRef.current
        if (current) publishDownloadProgress({ ...current, status: "cancelled", speedBytesPerSecond: 0 })
        setMessage("下载已取消")
      } else {
        const remote = (error as Error & { body?: ApiErrorBody }).body?.data?.available_at
        if (remote?.length) {
          setLocations(remote)
          setDownloadProgress(null)
          downloadProgressRef.current = null
          setMessage("当前节点没有该对象，请选择可用服务点下载")
        } else {
          setDownloadProgress(null)
          downloadProgressRef.current = null
          fail(error)
        }
      }
    } finally {
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null
      setBusy(false)
    }
  }

  return (
    <section aria-label="Storagent 文件组件" className="storagent-files">
      <fieldset disabled={!configured}>
        <legend>上传文件</legend>
        <input
          type="file"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null
            setFile(selected)
            setMessage(selected?.size === 0 ? EMPTY_FILE_ERROR : "")
          }}
        />
        <button type="button" disabled={!file || file.size <= 0 || !ready} onClick={() => void upload()}>
          {busy ? "处理中..." : "开始上传"}
        </button>
        {progress ? <progress value={progress.done} max={progress.total} /> : null}
      </fieldset>

      <fieldset disabled={!configured}>
        <legend>查询与下载</legend>
        <input
          value={objectKey}
          placeholder="object_key"
          disabled={busy}
          onChange={(event) => {
            setObjectKey(event.target.value)
            setDownloadProgress(null)
            downloadProgressRef.current = null
          }}
        />
        <button type="button" disabled={busy} onClick={() => void getStat()}>获取元信息</button>
        <button type="button" disabled={busy} onClick={() => void locate()}>定位服务点</button>
        <button type="button" disabled={busy} onClick={() => void download()}>下载</button>
      </fieldset>

      {downloadProgress ? (
        <div aria-live="polite">
          <strong>
            {downloadProgress.status === "downloading"
              ? "正在下载"
              : downloadProgress.status === "completed"
                ? "下载完成"
                : "下载已取消"}
          </strong>
          <progress
            value={downloadProgress.totalBytes == null
              ? 0
              : downloadProgress.totalBytes === 0
                ? downloadProgress.status === "completed" ? 100 : 0
                : (downloadProgress.receivedBytes / downloadProgress.totalBytes) * 100}
            max={100}
          />
          <span>
            {formatBytes(downloadProgress.receivedBytes)} / {downloadProgress.totalBytes == null
              ? "正在获取文件大小"
              : formatBytes(downloadProgress.totalBytes)} · {downloadProgress.totalBytes == null
                ? "--"
                : downloadProgress.totalBytes === 0
                  ? downloadProgress.status === "completed" ? "100%" : "0%"
                  : \`\${Math.min(100, downloadProgress.receivedBytes * 100 / downloadProgress.totalBytes).toFixed(1)}%\`
              } · {formatBytes(downloadProgress.speedBytesPerSecond)}/s
          </span>
          {downloadProgress.status === "downloading" ? (
            <button type="button" onClick={() => downloadAbortRef.current?.abort()}>取消下载</button>
          ) : null}
        </div>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {stat ? <pre>{JSON.stringify(stat, null, 2)}</pre> : null}
      {locations.length ? (
        <ul>
          {locations.map((location) => (
            <li key={location.endpoint}>
              {location.shown_name} ({location.region})
              <button type="button" disabled={busy} onClick={() => void download(location)}>
                从此节点下载
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}`,
    usage: `import { QuotaExceededError, StoragentFiles } from "./StoragentFiles"

function handleError(error: Error) {
  if (error instanceof QuotaExceededError) {
    console.error("APP 存储超出限额，请联系管理员处理")
    return // 配额错误不应自动重试
  }
  console.error(error)
}

export function FilesPage() {
  return (
    <StoragentFiles
      baseURL={import.meta.env.VITE_STORAGENT_BASE_URL}
      apiKey={import.meta.env.VITE_STORAGENT_API_KEY}
      onUploaded={({ objectKey }) => console.log("object_key:", objectKey)}
      onDownloadProgress={(progress) => console.log("download:", progress)}
      onError={handleError}
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
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from time import monotonic
from typing import Any, Callable, Literal, overload

import requests


MIB = 1024 * 1024
DEFAULT_CHUNK_SIZE = 5 * MIB
MAX_MULTIPART_PARTS = 10_000
EMPTY_FILE_ERROR = "空文件暂不支持上传，请选择包含内容的文件"


def multipart_chunk_size(file_size: int, configured_size: int) -> int:
    required_size = (file_size + MAX_MULTIPART_PARTS - 1) // MAX_MULTIPART_PARTS
    unaligned_size = max(int(configured_size), required_size, 1)
    return ((unaligned_size + MIB - 1) // MIB) * MIB


class StoragentError(RuntimeError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        super().__init__((body or {}).get("msg") or f"Storagent HTTP {status}")


class QuotaExceededError(StoragentError):
    def __init__(self, status: int, body: dict[str, Any] | None):
        self.status = status
        self.body = body
        RuntimeError.__init__(self, "APP 存储超出限额，请联系管理员处理")


class DownloadCancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class DownloadProgress:
    downloaded_bytes: int
    total_bytes: int | None
    bytes_per_second: float
    elapsed_seconds: float

    @property
    def percent(self) -> float | None:
        if self.total_bytes is None:
            return None
        if self.total_bytes == 0:
            return 100.0
        return min(100.0, self.downloaded_bytes * 100 / self.total_bytes)


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
        if (body or {}).get("code") == 413049:
            raise QuotaExceededError(response.status_code, body)
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
        size_bytes = path.stat().st_size
        if size_bytes <= 0:
            raise ValueError(EMPTY_FILE_ERROR)
        chunk_size = multipart_chunk_size(size_bytes, self.chunk_size)
        initialized = self._json(
            "POST",
            "/api/files/multipart/init",
            json={"content_type": mime, "size_bytes": size_bytes},
        )
        parts: list[dict[str, Any]] = []

        try:
            with path.open("rb") as source:
                part_number = 1
                while True:
                    chunk = source.read(chunk_size)
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

    def download_object(
        self,
        object_key: str,
        output_path: str | Path,
        *,
        on_progress: Callable[[DownloadProgress], None] | None = None,
        cancel_event: Event | None = None,
    ) -> dict[str, Any]:
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
                metadata = self._request(
                    "POST",
                    location["stat_url"],
                    json=location.get("stat_body") or {"object_key": object_key},
                ).json()
            else:
                raise

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        partial_path = path.with_name(path.name + ".part")
        total_bytes = int(metadata["size"]) if metadata.get("size") is not None else None
        if cancel_event and cancel_event.is_set():
            raise DownloadCancelled(f"download cancelled before start: {object_key}")

        if location:
            response = self._request("GET", location["download_url"], stream=True)
        else:
            response = self._request(
                "GET",
                "/api/files/object/download",
                params={"object_key": object_key, "offset": 0, "length": 0},
                stream=True,
            )

        started_at = monotonic()
        last_report_at = started_at
        last_report_bytes = 0
        downloaded_bytes = 0
        completed = False

        try:
            with partial_path.open("wb") as target:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if cancel_event and cancel_event.is_set():
                        raise DownloadCancelled(
                            f"download cancelled after {downloaded_bytes} bytes: {object_key}"
                        )
                    if not chunk:
                        continue
                    target.write(chunk)
                    downloaded_bytes += len(chunk)

                    now = monotonic()
                    if on_progress and (
                        last_report_bytes == 0 or now - last_report_at >= 0.25
                    ):
                        on_progress(DownloadProgress(
                            downloaded_bytes=downloaded_bytes,
                            total_bytes=total_bytes,
                            bytes_per_second=(downloaded_bytes - last_report_bytes)
                            / max(0.001, now - last_report_at),
                            elapsed_seconds=now - started_at,
                        ))
                        last_report_at = now
                        last_report_bytes = downloaded_bytes

            if cancel_event and cancel_event.is_set():
                raise DownloadCancelled(
                    f"download cancelled after {downloaded_bytes} bytes: {object_key}"
                )
            elapsed_seconds = max(0.001, monotonic() - started_at)
            final_progress = DownloadProgress(
                downloaded_bytes=downloaded_bytes,
                total_bytes=total_bytes,
                bytes_per_second=downloaded_bytes / elapsed_seconds,
                elapsed_seconds=elapsed_seconds,
            )
            if on_progress:
                on_progress(final_progress)
            partial_path.replace(path)
            completed = True
        finally:
            response.close()
            if not completed:
                partial_path.unlink(missing_ok=True)

        return {
            "object_key": object_key,
            "output_path": str(path),
            "metadata": metadata,
            "source": location,
            "downloaded_bytes": downloaded_bytes,
            "elapsed_seconds": final_progress.elapsed_seconds,
            "average_bytes_per_second": final_progress.bytes_per_second,
        }

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "StoragentFilesClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()`,
    usage: `import os
from threading import Event

from storagent_files import DownloadProgress, QuotaExceededError, StoragentFilesClient


def show_download_progress(progress: DownloadProgress) -> None:
    percent = "--" if progress.percent is None else f"{progress.percent:.1f}%"
    speed_mib = progress.bytes_per_second / 1024 / 1024
    print(f"download {percent} · {speed_mib:.2f} MiB/s")


cancel_download = Event()
# GUI 或任务队列的“取消”处理器中调用 cancel_download.set()。


try:
    with StoragentFilesClient(
        os.environ["STORAGENT_BASE_URL"],
        os.environ["STORAGENT_API_KEY"],
    ) as files:
        object_key = files.upload_file("./example.bin")
        print("object_key:", object_key)

        upload_result = files.upload_file("./report.pdf", return_json=True)
        print("upload result:", upload_result)

        metadata = files.stat_object(object_key)
        download_result = files.download_object(
            object_key,
            "./downloads/example.bin",
            on_progress=show_download_progress,
            cancel_event=cancel_download,
        )
        print("metadata:", metadata)
        print("download result:", download_result)
except QuotaExceededError:
    print("APP 存储超出限额，请联系管理员处理")
    # 配额错误不应自动重试。`,
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
      ? "将完整组件文件加入 React 项目后直接引入。组件覆盖空文件校验、动态分片上传、object_key 回填、元信息查询、服务点定位、当前节点与跨区域回退下载，并显示下载进度、速度和取消动作。"
      : "将客户端类文件加入 Python 项目后直接实例化。类对外提供带空文件校验和动态分片的上传、元信息、定位和下载方法；上传可返回 object_key 或完整 JSON，下载支持进度回调、取消事件并返回结果字典。",
    "",
    "## 安全约束",
    "",
    "- APIKey 只使用 `x-api-key` 请求头，不得放入 URL 或日志。",
    "- `stat` 使用 POST JSON；`locate` 与 `download` 的 object_key 使用标准 URL 编码。",
    "- 上传异常时调用 multipart abort；下载大文件采用流式处理，不得先将完整响应载入内存后才更新进度。",
    "- 新 APP 默认存储配额为 100 GiB；multipart init 必须提交完整文件大小 `size_bytes`，并会跨区域预留声明容量。",
    "- 空文件必须在发送 init 前拒绝；非空文件取配置分片与 `ceil(file_size / 10000)` 的较大值并向上对齐到 MiB，确保总片数不超过 10,000。",
    "- 同一 `part_number` 可顺序重传，以最后一次成功上传的 ETag 和分片大小为准。",
    "- multipart complete 或 abort 会释放该会话的跨区域预留容量。",
    "- 收到业务码 `413049` 时抛出 `QuotaExceededError`，停止重试并提示联系应用管理员。",
    "- 下载前使用 POST stat 获取准确总大小；下载过程中至少展示已接收字节、总大小、百分比和实时速度。",
    "- 用户取消下载时必须立即中断网络读取，并且不得保存或保留可被误用的残缺文件。",
    isTypeScript
      ? "- 浏览器组件适合可信内网或临时演示。互联网生产系统应由业务服务端代持 APIKey。"
      : "- APIKey 应由服务端环境变量或密钥管理系统注入。",
    "",
    "## 上传配额与分片重传契约",
    "",
    "1. 在发送 `multipart/init` 前拒绝空文件；使用非空文件的完整 `size_bytes` 跨区域预留声明容量。",
    "2. 取配置分片与 `ceil(file_size / 10000)` 的较大值并向上对齐到 MiB，保证总片数不超过 10,000。",
    "3. 收到业务码 `413049` 时立即停止，不重试 init，也不继续发送分片，提示联系应用管理员。",
    "4. 同一 `part_number` 可在失败后顺序重传；不要并发重传同一编号，每次成功后覆盖保存该编号的 ETag。",
    "5. parts 查询与 complete 提交均以同一编号最后一次成功上传的 ETag 和 size 为准；complete 或 abort 后会话预留容量被释放。",
    "",
    "## 下载进度与取消契约",
    "",
    "1. 下载前调用 `POST /api/files/object/stat`，使用响应中的 `size` 作为总字节数；跨节点下载使用定位结果中的 `stat_url` 和 `stat_body`。",
    "2. 读取下载响应流时累计已接收字节，并按不高于每 250ms 一次的频率更新速度和百分比，避免高频 UI 刷新。",
    "3. 只有响应流完整结束后才生成最终下载文件。取消、网络错误或服务错误均不得产出最终文件。",
    isTypeScript
      ? "4. React 组件通过 `onDownloadProgress` 向业务模块上报 `status`、`receivedBytes`、`totalBytes` 与 `speedBytesPerSecond`；取消按钮调用 `AbortController.abort()`。"
      : "4. Python 类通过 `on_progress(DownloadProgress)` 回调上报进度；业务线程调用 `cancel_event.set()` 后，下载循环抛出 `DownloadCancelled` 并删除 `.part` 临时文件。",
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
    "- [ ] 上传保存 upload_id、object_key、part_number 与 ETag；同一编号重传后覆盖保存最后成功 ETag。",
    "- [ ] 空文件会在发送 init 前被明确拒绝；分片大小动态增大并按 MiB 对齐，总片数不超过 10,000。",
    "- [ ] multipart init 使用完整源文件的字节数作为 size_bytes，并了解其会跨区域预留声明容量。",
    "- [ ] 413049 会转换为 QuotaExceededError，且不会继续重试或发送分片。",
    "- [ ] 成功 complete 或执行 abort 后会话预留容量被释放；取消或不可恢复失败时会调用 abort。",
    "- [ ] 上传结果可供外部业务模块取得 object_key 或完整响应。",
    "- [ ] stat 使用 POST JSON，能够处理业务码 404032。",
    "- [ ] 当前节点无副本时能从 available_at 选择节点继续下载。",
    "- [ ] 当前节点和跨节点下载均持续上报已接收字节、总大小、百分比与速度。",
    "- [ ] 下载可以由用户或调用模块取消，取消后不产生最终文件。",
    "- [ ] 下载完成结果可被外部业务模块继续处理。",
    "",
  ].join("\n")
}
