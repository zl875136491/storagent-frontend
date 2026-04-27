import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  baseURL: string
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
}

function joinUrl(baseURL: string, path: string) {
  return `${baseURL.replace(/\/$/, "")}${path}`
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  const text = await resp.text().catch(() => "")
  if (!resp.ok) throw new Error(text || `请求失败: ${resp.status}`)
  return (text ? (JSON.parse(text) as T) : (undefined as unknown as T))
}

function filenameFromObjectKey(objectKey: string) {
  const trimmed = objectKey.trim().replace(/\/+$/, "")
  const seg = trimmed.split("/").filter(Boolean).pop()
  return seg || "download.bin"
}

export function FileDownloadDemo({ baseURL, apiKey, defaultObjectKey }: Props) {
  const [objectKey, setObjectKey] = useState(defaultObjectKey ?? "")
  const [loading, setLoading] = useState(false)
  const [stat, setStat] = useState<ObjectStatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statOpen, setStatOpen] = useState(false)

  const canCall = Boolean(baseURL && apiKey && objectKey && !loading)

  const fetchStat = async () => {
    if (!baseURL) throw new Error("baseURL 为空")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ object_key: objectKey.trim() })
      const data = await jsonOrThrow<ObjectStatResponse>(
        await fetch(joinUrl(baseURL, `/api/files/object/stat?${qs.toString()}`), {
          method: "GET",
          headers: { "x-api-key": apiKey },
        }),
      )
      setStat(data)
      setStatOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取元信息失败")
      setStat(null)
    } finally {
      setLoading(false)
    }
  }

  const download = async () => {
    if (!baseURL) throw new Error("baseURL 为空")
    if (!apiKey) throw new Error("apiKey 为空")
    if (!objectKey.trim()) throw new Error("object_key 为空")

    setLoading(true)
    setError(null)
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
        const text = await resp.text().catch(() => "")
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. 下载组件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <Button disabled={!canCall} onClick={() => void download()}>
            {loading ? "下载中..." : "下载"}
          </Button>
        </div>

        {error ? <div className="text-sm text-destructive">{error}</div> : null}
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

