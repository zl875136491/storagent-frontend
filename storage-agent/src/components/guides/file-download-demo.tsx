import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { useGuideDemoBackendSelection } from "@/components/guides/guide-endpoints-context"
import {
  extractCrossRegionLocations,
  locateObjectApi,
  type ObjectLocationItem,
  type ObjectLocateResponse,
} from "@/api/client"

type Props = {
  apiKey: string
  defaultObjectKey?: string
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

async function downloadFromUrl(url: string, apiKey: string, objectKey: string) {
  const resp = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  })
  if (!resp.ok) {
    const text = await readErrorText(resp)
    throw new Error(text || `下载失败: ${resp.status}`)
  }
  const blob = await resp.blob()
  const objUrl = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objUrl
  a.download = filenameFromObjectKey(objectKey)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(objUrl)
}

export function FileDownloadDemo({ apiKey, defaultObjectKey }: Props) {
  const { base: baseURL, setBase: setBackendBase, listLoading: backendListLoading, listError: backendListError } =
    useGuideDemoBackendSelection()
  const [objectKey, setObjectKey] = useState(defaultObjectKey ?? "")
  const [loading, setLoading] = useState(false)
  const [stat, setStat] = useState<ObjectStatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statOpen, setStatOpen] = useState(false)
  const [locations, setLocations] = useState<ObjectLocationItem[] | null>(null)
  const [locateInfo, setLocateInfo] = useState<ObjectLocateResponse | null>(null)
  const [redirectHint, setRedirectHint] = useState<string | null>(null)

  useEffect(() => {
    if (defaultObjectKey != null && defaultObjectKey !== "") {
      setObjectKey(defaultObjectKey)
    }
  }, [defaultObjectKey])

  const canCall = Boolean(
    baseURL && apiKey && objectKey.trim() && !loading && !backendListLoading && !backendListError,
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
      const resp = await fetch(joinUrl(baseURL, "/api/files/object/stat"), {
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

  const download = async () => {
    if (!baseURL) throw new Error("请先选择可达的后端服务")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    setLoading(true)
    setError(null)
    setLocations(null)
    setRedirectHint(null)
    try {
      const qs = new URLSearchParams({
        object_key: objectKey.trim(),
        offset: "0",
        length: "0",
      })
      const resp = await fetch(joinUrl(baseURL, `/api/files/object/download?${qs.toString()}`), {
        method: "GET",
        headers: { "x-api-key": apiKey },
      })
      if (!resp.ok) {
        const text = await readErrorText(resp)
        const remote = extractCrossRegionLocations(text)
        if (remote) {
          setLocations(remote)
          setRedirectHint("本节点不存在该对象。请选择下方任一服务点继续下载：")
          return
        }
        throw new Error(text || `下载失败: ${resp.status}`)
      }

      const blob = await resp.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filenameFromObjectKey(objectKey)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败")
    } finally {
      setLoading(false)
    }
  }

  const downloadFromLocation = async (item: ObjectLocationItem) => {
    setLoading(true)
    setError(null)
    try {
      await downloadFromUrl(item.download_url, apiKey, objectKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : "跨节点下载失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. 下载组件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <GuideBackendSelector value={baseURL} onChange={setBackendBase} />

        <div className="space-y-2">
          <Label htmlFor="download-object-key">object_key</Label>
          <Input
            id="download-object-key"
            placeholder="例如：path/to/file.bin"
            value={objectKey}
            onChange={(e) => setObjectKey(e.target.value)}
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
            {loading ? "处理中..." : "下载"}
          </Button>
        </div>

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
