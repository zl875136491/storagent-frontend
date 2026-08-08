import { useEffect, useRef, useState } from "react"
import { CircleStop } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { useGuideDemoBackendSelection } from "@/components/guides/guide-endpoints-context"
import {
  extractCrossRegionLocations,
  locateObjectApi,
  type ObjectLocationItem,
  type ObjectLocateResponse,
} from "@/api/client"
import { gatewayUrlForRegion } from "@/api/backendResolver"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = {
  apiKey: string
  /** 页面级共享后端；未提供时组件保留独立选择能力。 */
  baseURL?: string
  defaultObjectKey?: string
  className?: string
}

type ObjectStatResponse = {
  bucket: string
  object_key: string
  size: number
  etag: string
  content_type?: string | null
  last_modified?: string | null
  region?: string | null
  local?: boolean
}

type DownloadPhase = "downloading" | "completed" | "cancelled"

type DownloadProgressState = {
  phase: DownloadPhase
  receivedBytes: number
  totalBytes: number | null
  speedBytesPerSecond: number
}

type DownloadTarget = {
  downloadURL: string
  statURL: string
  statBody: { object_key: string }
}

function joinUrl(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, "")}${path}`
}

async function readErrorText(resp: Response): Promise<string> {
  return resp.text().catch(() => "")
}

function filenameFromObjectKey(objectKey: string) {
  const trimmed = objectKey.trim().replace(/\/+$/, "")
  const seg = trimmed.split("/").filter(Boolean).pop()
  return seg || "download.bin"
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function saveBlob(blob: Blob, objectKey: string) {
  const objUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objUrl
  anchor.download = filenameFromObjectKey(objectKey)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(objUrl)
}

async function fetchObjectSize(target: DownloadTarget, apiKey: string, signal: AbortSignal) {
  const resp = await fetch(target.statURL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(target.statBody),
  })
  const text = await readErrorText(resp)
  if (!resp.ok) {
    const error = new Error(text || `获取元信息失败: ${resp.status}`) as Error & { responseText?: string }
    error.responseText = text
    throw error
  }
  const metadata = text ? (JSON.parse(text) as ObjectStatResponse) : null
  return metadata?.size != null && Number.isFinite(metadata.size) ? Math.max(0, metadata.size) : null
}

async function downloadFromUrl({
  target,
  apiKey,
  objectKey,
  signal,
  totalBytes,
  onProgress,
}: {
  target: DownloadTarget
  apiKey: string
  objectKey: string
  signal: AbortSignal
  totalBytes: number | null
  onProgress: (progress: Omit<DownloadProgressState, "phase">) => void
}) {
  const resp = await fetch(target.downloadURL, {
    method: "GET",
    signal,
    headers: { "x-api-key": apiKey },
  })
  if (!resp.ok) {
    const text = await readErrorText(resp)
    const error = new Error(text || `下载失败: ${resp.status}`) as Error & { responseText?: string }
    error.responseText = text
    throw error
  }

  if (!resp.body) throw new Error("当前浏览器不支持流式下载进度")

  const contentLength = resp.headers.get("Content-Length")
  const headerSize = contentLength == null ? Number.NaN : Number(contentLength)
  const resolvedTotal = Number.isFinite(headerSize) && headerSize >= 0 ? headerSize : totalBytes
  const reader = resp.body.getReader()
  const chunks: BlobPart[] = []
  const startedAt = performance.now()
  let lastReportedAt = startedAt
  let lastReportedBytes = 0
  let receivedBytes = 0
  let currentSpeed = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value.slice().buffer)
    receivedBytes += value.byteLength

    const now = performance.now()
    const sampleDuration = now - lastReportedAt
    if (lastReportedBytes === 0 || sampleDuration >= 250) {
      const sampleBytes = receivedBytes - lastReportedBytes
      currentSpeed = sampleDuration > 0 ? (sampleBytes * 1000) / sampleDuration : 0
      lastReportedAt = now
      lastReportedBytes = receivedBytes
      onProgress({ receivedBytes, totalBytes: resolvedTotal, speedBytesPerSecond: currentSpeed })
    }
  }

  const elapsed = Math.max(1, performance.now() - startedAt)
  const averageSpeed = (receivedBytes * 1000) / elapsed
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError")
  onProgress({
    receivedBytes,
    totalBytes: resolvedTotal ?? receivedBytes,
    speedBytesPerSecond: averageSpeed || currentSpeed,
  })
  saveBlob(new Blob(chunks, { type: resp.headers.get("Content-Type") || "application/octet-stream" }), objectKey)
  return { receivedBytes, totalBytes: resolvedTotal ?? receivedBytes, speedBytesPerSecond: averageSpeed }
}

export function FileDownloadDemo({ apiKey, baseURL: providedBaseURL, defaultObjectKey, className }: Props) {
  const { base: selectedBaseURL, setBase: setBackendBase, listLoading: backendListLoading, listError: backendListError } =
    useGuideDemoBackendSelection()
  const baseURL = providedBaseURL ?? selectedBaseURL
  const [objectKey, setObjectKey] = useState(defaultObjectKey ?? "")
  const [loading, setLoading] = useState(false)
  const [stat, setStat] = useState<ObjectStatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statOpen, setStatOpen] = useState(false)
  const [locations, setLocations] = useState<ObjectLocationItem[] | null>(null)
  const [locateInfo, setLocateInfo] = useState<ObjectLocateResponse | null>(null)
  const [redirectHint, setRedirectHint] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState | null>(null)
  const downloadControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (defaultObjectKey != null && defaultObjectKey !== "") {
      setObjectKey(defaultObjectKey)
    }
  }, [defaultObjectKey])

  useEffect(() => () => downloadControllerRef.current?.abort(), [])

  const downloading = downloadProgress?.phase === "downloading"

  const canCall = Boolean(
    baseURL && apiKey && objectKey.trim() && !loading &&
    (providedBaseURL !== undefined || (!backendListLoading && !backendListError)),
  )

  const fetchStat = async () => {
    if (!baseURL) throw new Error("请先选择可达的后端服务")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    setLoading(true)
    setError(null)
    setLocations(null)
    setRedirectHint(null)
    try {
      const resp = await fetch(joinUrl(baseURL, "/api/v1/files/object/stat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ object_key: objectKey.trim() }),
      })
      const text = await readErrorText(resp)
      if (!resp.ok) {
        const remote = extractCrossRegionLocations(text)
        if (remote) {
          setLocations(remote)
          setRedirectHint("本节点不存在该对象，可前往以下服务点查看/下载：")
          setStat(null)
          return
        }
        throw new Error(text || `请求失败: ${resp.status}`)
      }
      setStat(text ? (JSON.parse(text) as ObjectStatResponse) : null)
      setStatOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取元信息失败")
      setStat(null)
    } finally {
      setLoading(false)
    }
  }

  const locate = async () => {
    if (!baseURL) throw new Error("请先选择可达的后端服务")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    setLoading(true)
    setError(null)
    setRedirectHint(null)
    try {
      const data = await locateObjectApi(baseURL, apiKey, objectKey.trim())
      setLocateInfo(data)
      setLocations(data.available_at.length > 0 ? data.available_at : null)
      if (!data.local_exists && data.available_at.length === 0) {
        setError("全集群均未找到该对象")
      } else if (!data.local_exists) {
        setRedirectHint(`本节点（${data.current_region}）不存在，以下节点有副本：`)
      } else {
        setRedirectHint(`本节点已有该对象；同时在 ${data.available_at.length} 个节点可访问`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "定位失败")
      setLocateInfo(null)
      setLocations(null)
    } finally {
      setLoading(false)
    }
  }

  const download = async (location?: ObjectLocationItem) => {
    if (!baseURL) throw new Error("请先选择可达的后端服务")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    const key = objectKey.trim()
    const query = new URLSearchParams({ object_key: key, offset: "0", length: "0" })
    const target: DownloadTarget = location
      ? {
          downloadURL: gatewayUrlForRegion(location.region, location.download_url),
          statURL: gatewayUrlForRegion(location.region, location.stat_url),
          statBody: location.stat_body,
        }
      : {
          downloadURL: joinUrl(baseURL, `/api/v1/files/object/download?${query.toString()}`),
          statURL: joinUrl(baseURL, "/api/v1/files/object/stat"),
          statBody: { object_key: key },
        }
    const controller = new AbortController()
    downloadControllerRef.current = controller
    setLoading(true)
    setError(null)
    setDownloadProgress({
      phase: "downloading",
      receivedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: 0,
    })
    if (!location) {
      setLocations(null)
      setRedirectHint(null)
    }
    try {
      const totalBytes = await fetchObjectSize(target, apiKey, controller.signal)
      setDownloadProgress({
        phase: "downloading",
        receivedBytes: 0,
        totalBytes,
        speedBytesPerSecond: 0,
      })
      const completed = await downloadFromUrl({
        target,
        apiKey,
        objectKey: key,
        signal: controller.signal,
        totalBytes,
        onProgress: (progress) => setDownloadProgress({ phase: "downloading", ...progress }),
      })
      setDownloadProgress({ phase: "completed", ...completed })
    } catch (e) {
      if (isAbortError(e)) {
        setDownloadProgress((current) => current ? { ...current, phase: "cancelled", speedBytesPerSecond: 0 } : null)
      } else {
        const responseText = (e as Error & { responseText?: string }).responseText ?? ""
        const remote = extractCrossRegionLocations(responseText)
        if (!location && remote) {
          setLocations(remote)
          setRedirectHint("本节点不存在该对象。请选择下方任一服务点继续下载：")
          setDownloadProgress(null)
        } else {
          setDownloadProgress(null)
          setError(e instanceof Error ? e.message : "下载失败")
        }
      }
    } finally {
      if (downloadControllerRef.current === controller) downloadControllerRef.current = null
      setLoading(false)
    }
  }

  const downloadFromLocation = async (item: ObjectLocationItem) => {
    await download(item)
  }

  return (
    <Card className={cn("rounded-lg shadow-none", className)}>
      <CardHeader>
        <CardTitle className="text-base">2. 下载组件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {providedBaseURL === undefined ? (
          <GuideBackendSelector value={baseURL} onChange={setBackendBase} />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="download-object-key">object_key</Label>
          <Input
            id="download-object-key"
            placeholder="例如：path/to/file.bin"
            value={objectKey}
            disabled={loading}
            onChange={(e) => {
              setObjectKey(e.target.value)
              setDownloadProgress(null)
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canCall} onClick={() => void fetchStat()}>
            获取元信息
          </Button>
          <Button variant="outline" disabled={!canCall} onClick={() => void locate()}>
            定位服务点
          </Button>
          <Button disabled={!canCall} onClick={() => void download()}>
            {downloading ? "下载中..." : loading ? "处理中..." : "下载"}
          </Button>
          {downloading ? (
            <Button type="button" variant="destructive" onClick={() => downloadControllerRef.current?.abort()}>
              <CircleStop className="mr-1.5 h-4 w-4" aria-hidden />
              取消下载
            </Button>
          ) : null}
        </div>

        {downloadProgress ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">
                {downloadProgress.phase === "downloading"
                  ? "正在下载"
                  : downloadProgress.phase === "completed"
                    ? "下载完成"
                    : "下载已取消"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {downloadProgress.totalBytes == null
                  ? "正在获取文件大小"
                  : `${downloadProgress.totalBytes === 0
                      ? downloadProgress.phase === "completed" ? 100 : 0
                      : Math.min(100, (downloadProgress.receivedBytes / downloadProgress.totalBytes) * 100).toFixed(1)}%`}
              </span>
            </div>
            <Progress
              value={downloadProgress.totalBytes == null || downloadProgress.totalBytes === 0
                ? downloadProgress.phase === "completed" ? 100 : 0
                : (downloadProgress.receivedBytes / downloadProgress.totalBytes) * 100}
              aria-label="文件下载进度"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
              <span>
                {formatBytes(downloadProgress.receivedBytes)}
                {downloadProgress.totalBytes == null ? "" : ` / ${formatBytes(downloadProgress.totalBytes)}`}
              </span>
              <span>{formatBytes(downloadProgress.speedBytesPerSecond)}/s</span>
            </div>
          </div>
        ) : null}

        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        {redirectHint && locations && locations.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="text-amber-800 dark:text-amber-200">{redirectHint}</div>
            {locateInfo ? (
              <div className="text-[11px] text-muted-foreground">
                bucket={locateInfo.bucket} · current_region={locateInfo.current_region} ·
                local_exists={String(locateInfo.local_exists)}
              </div>
            ) : null}
            <ul className="space-y-2">
              {locations.map((item) => (
                <li
                  key={`${item.region}-${item.endpoint}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5"
                >
                  <div className="min-w-0 text-xs">
                    <div className="font-medium text-foreground">
                      {item.shown_name} ({item.region})
                      {item.master ? (
                        <span className="ml-1 text-[10px] text-primary">本节点</span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground" title={item.endpoint}>
                      {item.endpoint}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading}
                    onClick={() => void downloadFromLocation(item)}
                  >
                    从此节点下载
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={statOpen && Boolean(stat)} onOpenChange={setStatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>对象元数据</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-sm">
              <code>{JSON.stringify(stat, null, 2)}</code>
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
