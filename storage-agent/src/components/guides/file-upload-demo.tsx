import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { useGuideDemoBackendSelection } from "@/components/guides/guide-endpoints-context"
import { cn } from "@/lib/utils"

type Props = {
  apiKey: string
  /** 页面级共享后端；未提供时组件保留独立选择能力。 */
  baseURL?: string
  chunkSizeBytes?: number
  onUploaded?: (result: { bucket: string; objectKey: string }) => void
  className?: string
}

type InitResp = { upload_id: string; bucket: string; object_key: string }
type PartResp = { part_number: number; etag: string }
type CompleteResp = { bucket: string; object_key: string; etag?: string | null; version_id?: string | null }
type ApiErrorBody = { msg?: string; code?: number; data?: unknown }

const MIB = 1024 * 1024
const DEFAULT_CHUNK_SIZE = 5 * MIB
const MAX_MULTIPART_PART_SIZE = 64 * MIB
const MAX_MULTIPART_PARTS = 10_000
const MAX_MULTIPART_FILE_SIZE = MAX_MULTIPART_PART_SIZE * MAX_MULTIPART_PARTS
const EMPTY_FILE_ERROR = "空文件暂不支持上传，请选择包含内容的文件"

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

export class UploadPartTooLargeError extends Error {
  readonly code = 413050
  readonly status: number | null
  readonly body: ApiErrorBody | null

  constructor(status: number | null = null, body: ApiErrorBody | null = null) {
    super("上传分片超过 64 MiB，请按服务端限制重新切分后上传")
    this.name = "UploadPartTooLargeError"
    this.status = status
    this.body = body
  }
}

function joinUrl(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, "")}${path}`
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  const text = await resp.text().catch(() => "")
  let body: ApiErrorBody | null = null
  try {
    body = text ? JSON.parse(text) as ApiErrorBody : null
  } catch {
    body = null
  }
  if (!resp.ok) {
    if (body?.code === 413049) throw new QuotaExceededError(resp.status, body)
    if (body?.code === 413050) throw new UploadPartTooLargeError(resp.status, body)
    throw new Error(body?.msg || text || `请求失败: ${resp.status}`)
  }
  return body as unknown as T
}

function sanitizeEtag(etag: string) {
  return etag.replace(/^"+|"+$/g, "")
}

function multipartChunkSize(fileSize: number, configuredSize = DEFAULT_CHUNK_SIZE) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error(EMPTY_FILE_ERROR)
  if (!Number.isFinite(configuredSize) || configuredSize <= 0) {
    throw new Error("分片大小必须是大于 0 的有限数值")
  }
  if (configuredSize > MAX_MULTIPART_PART_SIZE) throw new UploadPartTooLargeError()
  if (fileSize > MAX_MULTIPART_FILE_SIZE) {
    throw new Error("文件超过默认分片契约支持的 625 GiB，请联系管理员调整服务端策略")
  }
  const requiredSize = Math.ceil(fileSize / MAX_MULTIPART_PARTS)
  const chunkSize = Math.max(
    DEFAULT_CHUNK_SIZE,
    Math.ceil(Math.max(configuredSize, requiredSize) / MIB) * MIB,
  )
  if (chunkSize > MAX_MULTIPART_PART_SIZE) throw new UploadPartTooLargeError()
  return chunkSize
}

export function FileUploadDemo({ apiKey, baseURL: providedBaseURL, chunkSizeBytes, onUploaded, className }: Props) {
  const { base: selectedBaseURL, setBase: setBackendBase, listLoading: backendListLoading, listError: backendListError } =
    useGuideDemoBackendSelection()
  const baseURL = providedBaseURL ?? selectedBaseURL
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ bucket: string; objectKey: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  const canUpload = Boolean(
    baseURL && apiKey && file && file.size > 0 && !uploading &&
    (providedBaseURL !== undefined || (!backendListLoading && !backendListError)),
  )

  const upload = async () => {
    if (!file) return
    if (file.size <= 0) {
      setError(EMPTY_FILE_ERROR)
      return
    }
    if (!baseURL) throw new Error("请先选择可达的后端服务")
    if (!apiKey) throw new Error("apiKey 为空")

    let chunkSize: number
    try {
      chunkSize = multipartChunkSize(file.size, chunkSizeBytes)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)
    setProgress(null)

    let uploadId = ""
    let objectKey = ""

    try {
      const init = await jsonOrThrow<InitResp>(
        await fetch(joinUrl(baseURL, "/api/files/multipart/init"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            content_type: file.type || "application/octet-stream",
            size_bytes: file.size,
          }),
        }),
      )
      uploadId = init.upload_id
      objectKey = init.object_key

      const totalParts = Math.max(1, Math.ceil(file.size / chunkSize))
      setProgress({ done: 0, total: totalParts })

      const parts: { part_number: number; etag: string }[] = []
      for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
        const start = (partNumber - 1) * chunkSize
        const end = Math.min(file.size, start + chunkSize)
        const blob = file.slice(start, end)

        const fd = new FormData()
        fd.set("upload_id", init.upload_id)
        fd.set("object_key", init.object_key)
        fd.set("part_number", String(partNumber))
        fd.set("file", blob, file.name)

        const part = await jsonOrThrow<PartResp>(
          await fetch(joinUrl(baseURL, "/api/files/multipart/part"), {
            method: "POST",
            headers: { "x-api-key": apiKey },
            body: fd,
          }),
        )

        parts.push({ part_number: part.part_number, etag: sanitizeEtag(part.etag) })
        setProgress({ done: partNumber, total: totalParts })
      }

      const complete = await jsonOrThrow<CompleteResp>(
        await fetch(joinUrl(baseURL, "/api/files/multipart/complete"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            upload_id: init.upload_id,
            object_key: init.object_key,
            parts: parts.sort((a, b) => a.part_number - b.part_number),
          }),
        }),
      )

      const finalResult = { bucket: complete.bucket, objectKey: complete.object_key }
      setResult(finalResult)
      setResultOpen(true)
      onUploaded?.(finalResult)
    } catch (e) {
      if (uploadId && objectKey && baseURL) {
        void fetch(joinUrl(baseURL, "/api/files/multipart/abort"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ upload_id: uploadId, object_key: objectKey }),
        }).catch(() => undefined)
      }
      setError(e instanceof Error ? e.message : "上传失败")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className={cn("rounded-lg shadow-none", className)}>
      <CardHeader>
        <CardTitle className="text-base">1. 上传组件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {providedBaseURL === undefined ? (
          <GuideBackendSelector value={baseURL} onChange={setBackendBase} />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="upload-file">选择文件</Label>
          <Input
            id="upload-file"
            type="file"
            onChange={(e) => {
              const selected = e.target.files?.[0] ?? null
              setFile(selected)
              setError(selected?.size === 0 ? EMPTY_FILE_ERROR : null)
            }}
          />
        </div>

        <Button disabled={!canUpload} onClick={() => void upload()}>
          {uploading ? "上传中..." : "开始上传"}
        </Button>

        {progress ? (
          <div className="space-y-2">
            <div className="text-sm">进度：{progress.done}/{progress.total}</div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
          </div>
        ) : null}

        {error ? <div className="text-sm text-destructive">{error}</div> : null}
      </CardContent>

      <Dialog open={resultOpen && Boolean(result)} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传结果</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-sm">
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
