import { useMemo, useState } from "react"
import { getApiBaseUrl } from "@/api/client"
import { ApiKeyProvider, useApiKey } from "@/components/guides/api-key-context"
import { CodePreview } from "@/components/guides/code-preview"
import { FileDownloadDemo } from "@/components/guides/file-download-demo"
import { FileUploadDemo } from "@/components/guides/file-upload-demo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function ApiKeyBox() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey()
  const [draft, setDraft] = useState(apiKey)
  const [show, setShow] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-base">API Key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="demo-api-key">x-api-key</Label>
          <div className="flex items-center gap-2">
            <Input
              id="demo-api-key"
              type={show ? "text" : "password"}
              placeholder="粘贴你的 API Key"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button variant="outline" onClick={() => setShow((v) => !v)}>
              {show ? "隐藏" : "显示"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setApiKey(draft)}
            disabled={!draft.trim()}
          >
            保存
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            清除
          </Button>
        </div>
        {apiKey ? <div className="text-sm">已保存（长度：{apiKey.length}）</div> : null}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认清除 API Key？</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            清除后，本页上传/下载将无法继续调用，且本地缓存会被删除。
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearApiKey()
                setDraft("")
                setConfirmOpen(false)
              }}
            >
              确认清除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function uploadCode() {
  return `import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"

type Props = {
  baseURL: string
  apiKey: string
  chunkSizeBytes?: number
}

type InitResp = { upload_id: string; bucket: string; object_key: string }
type PartResp = { part_number: number; etag: string }
type CompleteResp = { bucket: string; object_key: string }

function joinUrl(baseURL: string, path: string) {
  return \`\${baseURL.replace(/\\/$/, "")}\${path}\`
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  const text = await resp.text().catch(() => "")
  if (!resp.ok) throw new Error(text || \`请求失败: \${resp.status}\`)
  return (text ? (JSON.parse(text) as T) : (undefined as unknown as T))
}

function sanitizeEtag(etag: string) {
  return etag.replace(/^"+|"+$/g, "")
}

export function FileUploadDemo({ baseURL, apiKey, chunkSizeBytes }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ bucket: string; objectKey: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  const chunkSize = useMemo(() => chunkSizeBytes ?? 5 * 1024 * 1024, [chunkSizeBytes])

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const init = await jsonOrThrow<InitResp>(
        await fetch(joinUrl(baseURL, "/api/files/multipart/init"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ content_type: file.type || "application/octet-stream" }),
        }),
      )

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
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            upload_id: init.upload_id,
            object_key: init.object_key,
            parts: parts.sort((a, b) => a.part_number - b.part_number),
          }),
        }),
      )

      setResult({ bucket: complete.bucket, objectKey: complete.object_key })
      setResultOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. 上传组件</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="upload-file">选择文件</Label>
          <Input id="upload-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <Button disabled={!baseURL || !apiKey || !file || uploading} onClick={() => void upload()}>
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
}`
}

function downloadCode() {
  return `import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  baseURL: string
  apiKey: string
}

type ObjectStatResponse = {
  bucket: string
  object_key: string
  size: number
  etag: string
  content_type?: string | null
}

function joinUrl(baseURL: string, path: string) {
  return \`\${baseURL.replace(/\\/$/, "")}\${path}\`
}

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  const text = await resp.text().catch(() => "")
  if (!resp.ok) throw new Error(text || \`请求失败: \${resp.status}\`)
  return (text ? (JSON.parse(text) as T) : (undefined as unknown as T))
}

function filenameFromObjectKey(objectKey: string) {
  const trimmed = objectKey.trim().replace(/\\/+$/, "")
  const seg = trimmed.split("/").filter(Boolean).pop()
  return seg || "download.bin"
}

export function FileDownloadDemo({ baseURL, apiKey }: Props) {
  const [objectKey, setObjectKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [stat, setStat] = useState<ObjectStatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statOpen, setStatOpen] = useState(false)

  const fetchStat = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ object_key: objectKey.trim() })
      const data = await jsonOrThrow<ObjectStatResponse>(
        await fetch(joinUrl(baseURL, \`/api/files/object/stat?\${qs.toString()}\`), {
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
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ object_key: objectKey.trim(), offset: "0", length: "0" })
      const resp = await fetch(joinUrl(baseURL, \`/api/files/object/download?\${qs.toString()}\`), {
        method: "GET",
        headers: { "x-api-key": apiKey },
      })
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || \`下载失败: \${resp.status}\`)
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
          <Input id="download-object-key" value={objectKey} onChange={(e) => setObjectKey(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!baseURL || !apiKey || !objectKey.trim() || loading} onClick={() => void fetchStat()}>
            获取元信息
          </Button>
          <Button disabled={!baseURL || !apiKey || !objectKey.trim() || loading} onClick={() => void download()}>
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
}`
}

function InnerPage() {
  const { apiKey } = useApiKey()
  const baseURL = getApiBaseUrl()
  const [lastUploadedObjectKey, setLastUploadedObjectKey] = useState<string | null>(null)

  const uploadSnippet = useMemo(() => uploadCode(), [])
  const downloadSnippet = useMemo(() => downloadCode(), [])
  const installCommands = useMemo(() => {
    const comps = "button input card label dialog progress radio-group"
    return {
      npx: `npx shadcn@latest add ${comps}`,
      pnpm: `pnpm dlx shadcn@latest add ${comps}`,
      yarn: `yarn dlx shadcn@latest add ${comps}`,
      npm: `npm exec --yes shadcn@latest add ${comps}`,
    } as const
  }, [])

  return (
    <div className="space-y-6">
      <ApiKeyBox />

      <div className="space-y-3">
        <FileUploadDemo
          baseURL={baseURL}
          apiKey={apiKey}
          onUploaded={(r) => setLastUploadedObjectKey(r.objectKey)}
        />
        <CodePreview
          title="上传组件代码（可复制）"
          installCommands={installCommands}
          previewLines={16}
          codeLanguage="tsx"
          code={uploadSnippet}
        />
      </div>

      <div className="space-y-3">
        <FileDownloadDemo
          baseURL={baseURL}
          apiKey={apiKey}
          defaultObjectKey={lastUploadedObjectKey ?? undefined}
        />
        <CodePreview
          title="下载组件代码（可复制）"
          installCommands={installCommands}
          previewLines={16}
          codeLanguage="tsx"
          code={downloadSnippet}
        />
      </div>
    </div>
  )
}

export default function FileComponentsGuidePage() {
  return (
    <ApiKeyProvider>
      <InnerPage />
    </ApiKeyProvider>
  )
}

