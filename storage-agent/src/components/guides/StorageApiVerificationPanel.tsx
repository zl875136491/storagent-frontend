import { useEffect, useMemo, useState } from "react"
import { Check, CheckCircle2, CircleAlert, Copy, Eye, Loader2, Play, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Version = "v1" | "v2"
type CheckState = "idle" | "running" | "passed" | "failed"
type AnyRecord = Record<string, unknown>
type ResponseMode = "auto" | "bytes"

export type VerificationDetail = {
  id: string
  label: string
  path: string
  state: Extract<CheckState, "passed" | "failed">
  status?: number
  requestId?: string
  result?: string
  capturedAt: string
  request: { method: string; url: string; headers: AnyRecord; body: unknown }
  response?: { status: number; headers: AnyRecord; body: unknown }
}

type CheckItem = {
  id: string
  label: string
  path: string
  state: CheckState
  status?: number
  requestId?: string
  detail?: string
  exchange?: VerificationDetail
}

type Props = {
  version: Version
  baseURL: string
  apiKeyId: string
  accessToken?: string
  onDetailSelect: (detail: VerificationDetail | null) => void
}

const V1_CHECKS: ReadonlyArray<Pick<CheckItem, "id" | "label" | "path">> = [
  { id: "public-list", label: "公共端点列表", path: "GET /public/endpoints" },
  { id: "public-test", label: "公共端点探测", path: "GET /public/endpoints/test" },
  { id: "multipart-init", label: "初始化分片上传", path: "POST /files/multipart/init" },
  { id: "multipart-parts", label: "查询已上传分片", path: "GET /files/multipart/parts" },
  { id: "multipart-part", label: "上传分片", path: "POST /files/multipart/part" },
  { id: "multipart-complete", label: "完成分片上传", path: "POST /files/multipart/complete" },
  { id: "multipart-abort", label: "中止分片上传", path: "POST /files/multipart/abort" },
  { id: "object-stat", label: "对象元信息", path: "POST /files/object/stat" },
  { id: "object-locate", label: "对象服务点定位", path: "GET /files/object/locate" },
  { id: "object-download", label: "对象流式下载", path: "GET /files/object/download" },
]

const V2_EXTRA_CHECKS: ReadonlyArray<Pick<CheckItem, "id" | "label" | "path">> = [
  { id: "objects-list", label: "对象列表", path: "GET /files/objects" },
  { id: "objects-share", label: "创建一次性分享", path: "POST /files/objects/{object_id}/share" },
  { id: "share-bootstrap", label: "分享地址引导页", path: "GET /storage/objects/one-time-download" },
  { id: "share-redeem", label: "一次性下载兑换", path: "POST /storage/objects/one-time-download" },
  { id: "objects-delete", label: "软删除对象", path: "DELETE /files/objects/{object_id}" },
  { id: "objects-restore", label: "恢复对象", path: "POST /files/objects/{object_id}/restore" },
]

function definitions(version: Version) {
  return version === "v2" ? [...V1_CHECKS, ...V2_EXTRA_CHECKS] : [...V1_CHECKS]
}

function initialChecks(version: Version): CheckItem[] {
  return definitions(version).map((item) => ({ ...item, state: "idle" }))
}

function joinURL(baseURL: string, path: string) {
  return baseURL.replace(/\/+$/, "") + path
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? value as AnyRecord : {}
}

function unwrap(value: unknown): AnyRecord {
  const record = asRecord(value)
  return asRecord(record.data ?? value)
}

function readRequestId(response: Response, body: unknown) {
  const bodyRequestId = asRecord(body).request_id
  return String(bodyRequestId ?? response.headers.get("x-request-id") ?? "")
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) return await response.json().catch(() => ({}))
  return await response.text().catch(() => "")
}

function recordHeaders(headers?: HeadersInit) {
  const result: AnyRecord = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = key === "authorization" ? "Bearer [redacted]" : value
  })
  return result
}

function describeBody(body: BodyInit | null | undefined) {
  if (!body) return null
  if (typeof body === "string") {
    try { return JSON.parse(body) } catch { return body }
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries())
  if (body instanceof FormData) {
    const result: AnyRecord = {}
    body.forEach((value, key) => {
      result[key] = value instanceof File
        ? { file_name: value.name, content_type: value.type, size_bytes: value.size }
        : value
    })
    return result
  }
  return "[binary request body]"
}

function describeResponseBody(body: unknown, mode: ResponseMode) {
  if (mode === "bytes" && body instanceof Uint8Array) return { type: "binary", size_bytes: body.byteLength }
  return body
}

async function readResponseByMode(response: Response, mode: ResponseMode) {
  if (mode === "bytes") return new Uint8Array(await response.arrayBuffer())
  return readResponse(response)
}

function RequestIdCell({ requestId }: { requestId?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!requestId) return
    let copiedSuccessfully = false
    if (navigator.clipboard?.writeText) {
      copiedSuccessfully = await navigator.clipboard.writeText(requestId).then(() => true).catch(() => false)
    }
    if (!copiedSuccessfully) {
      const input = document.createElement("textarea")
      input.value = requestId
      input.setAttribute("readonly", "")
      input.style.position = "fixed"
      input.style.opacity = "0"
      document.body.appendChild(input)
      input.select()
      copiedSuccessfully = document.execCommand("copy")
      input.remove()
    }
    if (!copiedSuccessfully) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (!requestId) return <span className="text-muted-foreground">-</span>

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground max-[760px]:hidden" title={requestId}>{requestId}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copy()} aria-label="复制请求 ID" title={copied ? "已复制" : "复制请求 ID"}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}

export function StorageApiVerificationPanel({ version, baseURL, apiKeyId, accessToken, onDetailSelect }: Props) {
  const [checks, setChecks] = useState(() => initialChecks(version))
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const ready = Boolean(baseURL && apiKeyId && accessToken)
  const passed = useMemo(() => checks.filter((item) => item.state === "passed").length, [checks])

  // A document-version change represents a new verification context. Do not
  // depend on `running`: when a run finishes it becomes false, and the result
  // must remain visible until the user starts again, resets, or changes version.
  useEffect(() => {
    setChecks(initialChecks(version))
    setSummary(null)
    onDetailSelect(null)
  }, [version, onDetailSelect])

  const update = (id: string, patch: Partial<CheckItem>) => {
    setChecks((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const reset = () => {
    if (!running) {
      setChecks(initialChecks(version))
      setSummary(null)
      onDetailSelect(null)
    }
  }

  const run = async () => {
    if (!ready || running) return
    setRunning(true)
    setSummary(null)
    setChecks(initialChecks(version))
    onDetailSelect(null)
    const prefix = "/api/" + version
    const headers = () => ({ Authorization: "Bearer " + accessToken, "x-demo-api-key-id": apiKeyId })
    const jsonHeaders = () => ({ ...headers(), "Content-Type": "application/json" })
    const request = async (id: string, path: string, init: RequestInit = {}, responseMode: ResponseMode = "auto") => {
      update(id, { state: "running", detail: "请求中" })
      const url = joinURL(baseURL, path)
      const requestDetail = { method: init.method ?? "GET", url, headers: recordHeaders(init.headers), body: describeBody(init.body) }
      try {
        const response = await fetch(url, init)
        const body = await readResponseByMode(response, responseMode)
        const requestId = readRequestId(response, body)
        const responseDetail = { status: response.status, headers: recordHeaders(response.headers), body: describeResponseBody(body, responseMode) }
        if (!response.ok) {
          const bodyRecord = asRecord(body)
          const errorMessage = String(bodyRecord.message ?? bodyRecord.msg ?? ("HTTP " + response.status))
          update(id, { state: "failed", status: response.status, requestId, detail: errorMessage, exchange: { id, label: definitions(version).find((item) => item.id === id)?.label ?? id, path, state: "failed", status: response.status, requestId, result: errorMessage, capturedAt: new Date().toISOString(), request: requestDetail, response: responseDetail } })
          throw new Error(id + ": " + errorMessage)
        }
        update(id, { state: "passed", status: response.status, requestId, detail: "响应成功", exchange: { id, label: definitions(version).find((item) => item.id === id)?.label ?? id, path, state: "passed", status: response.status, requestId, result: "响应成功", capturedAt: new Date().toISOString(), request: requestDetail, response: responseDetail } })
        return { response, body }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(id + ": ")) throw error
        const message = error instanceof Error ? error.message : "网络请求失败"
        update(id, { state: "failed", detail: message, exchange: { id, label: definitions(version).find((item) => item.id === id)?.label ?? id, path, state: "failed", result: message, capturedAt: new Date().toISOString(), request: requestDetail } })
        throw new Error(id + ": " + message)
      }
    }

    let uploadId = ""
    let objectKey = ""
    let objectId = ""
    let part: { part_number: number; etag: string } | null = null

    try {
      await request("public-list", prefix + "/public/endpoints", { method: "GET" })
      await request("public-test", prefix + "/public/endpoints/test", { method: "GET" })

      const demo = prefix + "/demo/files"
      const testFile = new File(["storagent-api-verification-v1"], "storagent-api-verification.txt", { type: "text/plain" })
      const init = await request("multipart-init", demo + "/multipart/init", {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content_type: testFile.type, size_bytes: testFile.size }),
      })
      const initData = unwrap(init.body)
      uploadId = String(initData.upload_id ?? "")
      objectKey = String(initData.object_key ?? "")
      if (!uploadId || !objectKey) throw new Error("初始化响应缺少 upload_id 或 object_key")

      const query = new URLSearchParams({ upload_id: uploadId, object_key: objectKey })
      const partsBefore = await request("multipart-parts", demo + "/multipart/parts?" + query.toString(), { method: "GET", headers: headers() })
      if (!Array.isArray(unwrap(partsBefore.body).parts)) throw new Error("分片列表响应缺少 parts")

      const form = new FormData()
      form.set("upload_id", uploadId)
      form.set("object_key", objectKey)
      form.set("part_number", "1")
      form.set("file", testFile, testFile.name)
      const partResult = await request("multipart-part", demo + "/multipart/part", { method: "POST", headers: headers(), body: form })
      const partData = unwrap(partResult.body)
      part = { part_number: Number(partData.part_number), etag: String(partData.etag).replace(/^"+|"+$/g, "") }

      const partsAfter = await request("multipart-parts", demo + "/multipart/parts?" + query.toString(), { method: "GET", headers: headers() })
      if (!Array.isArray(unwrap(partsAfter.body).parts)) throw new Error("分片列表响应缺少 parts")
      await request("multipart-complete", demo + "/multipart/complete", {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ upload_id: uploadId, object_key: objectKey, parts: [part] }),
      })
      uploadId = ""

      const stat = await request("object-stat", demo + "/object/stat", {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ object_key: objectKey }),
      })
      const statData = unwrap(stat.body)
      if (Number(statData.size) !== testFile.size) throw new Error("元信息 size 与上传文件不一致")
      await request("object-locate", demo + "/object/locate?" + new URLSearchParams({ object_key: objectKey, offset: "0", length: "0" }).toString(), { method: "GET", headers: headers() })
      const download = await request(
        "object-download",
        demo + "/object/download?" + new URLSearchParams({ object_key: objectKey, offset: "0", length: "0" }).toString(),
        { method: "GET", headers: headers() },
        "bytes",
      )
      const downloaded = download.body as Uint8Array
      if (downloaded.byteLength !== testFile.size) throw new Error("下载大小与上传文件不一致")
      update("object-download", { detail: downloaded.byteLength + " 字节" })

      const abortInit = await request("multipart-init", demo + "/multipart/init", {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content_type: "text/plain", size_bytes: 1 }),
      })
      const abortData = unwrap(abortInit.body)
      uploadId = String(abortData.upload_id ?? "")
      await request("multipart-abort", demo + "/multipart/abort", {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify({ upload_id: uploadId, object_key: String(abortData.object_key ?? "") }),
      })
      uploadId = ""

      if (version === "v2") {
        const v2Demo = prefix + "/demo/files"
        const list = await request("objects-list", v2Demo + "/objects?state=active&limit=100", { method: "GET", headers: headers() })
        const items = Array.isArray(unwrap(list.body).items) ? unwrap(list.body).items as AnyRecord[] : []
        const found = items.find((item) => item.object_key === objectKey)
        if (!found) throw new Error("对象列表中没有找到刚完成的对象")
        objectId = String(found.object_id ?? "")
        if (!objectId) throw new Error("对象列表缺少 object_id")

        const share = await request("objects-share", v2Demo + "/objects/" + encodeURIComponent(objectId) + "/share", {
          method: "POST", headers: jsonHeaders(), body: JSON.stringify({ expires_in_seconds: 600, download_name: "verification.txt" }),
        })
        const shareData = unwrap(share.body)
        const shareURL = new URL(String(shareData.download_url ?? ""), window.location.origin)
        const sharePath = shareURL.pathname
        const token = new URLSearchParams(shareURL.hash.slice(1)).get("token")
        if (!token) throw new Error("分享响应缺少一次性 token")
        const bootstrap = await request("share-bootstrap", sharePath, { method: "GET" })
        if (!String(bootstrap.body).includes("form")) throw new Error("分享引导页无效")
        update("share-bootstrap", { detail: "HTML 引导页有效" })
        const redeemed = await request("share-redeem", sharePath, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }, "bytes")
        const redeemedBytes = redeemed.body as Uint8Array
        if (redeemedBytes.byteLength === 0) throw new Error("一次性下载兑换返回空文件")
        update("share-redeem", { detail: "首次兑换成功；重复兑换应失败" })
        const reused = await fetch(joinURL(baseURL, sharePath), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) })
        if (reused.ok) throw new Error("一次性地址第二次兑换仍然成功")

        await request("objects-delete", v2Demo + "/objects/" + encodeURIComponent(objectId), { method: "DELETE", headers: headers() })
        const trash = await request("objects-list", v2Demo + "/objects?state=trash&limit=100", { method: "GET", headers: headers() })
        const deleted = (Array.isArray(unwrap(trash.body).items) ? unwrap(trash.body).items as AnyRecord[] : []).some((item) => item.object_id === objectId)
        if (!deleted) throw new Error("软删除对象未出现在回收状态列表")
        await request("objects-restore", v2Demo + "/objects/" + encodeURIComponent(objectId) + "/restore", { method: "POST", headers: headers() })
      }
      setSummary(version + " 完整验证通过：" + definitions(version).length + " 个接口")
    } catch (error) {
      if (uploadId && objectKey) {
        await fetch(joinURL(baseURL, prefix + "/demo/files/multipart/abort"), { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ upload_id: uploadId, object_key: objectKey }) }).catch(() => undefined)
      }
      setSummary(error instanceof Error ? error.message : "验证失败")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div><CardTitle className="text-base">{version} 存储接口完整验证</CardTitle><p className="mt-1 text-xs font-normal text-muted-foreground">执行真实请求覆盖本版本全部存储接口；失败项保留 HTTP 状态与请求 ID。</p></div>
        <div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={reset} disabled={running} aria-label="重置验证结果"><RotateCcw className="h-3.5 w-3.5" /></Button><Button type="button" size="sm" onClick={() => void run()} disabled={!ready || running}><Play className="mr-1.5 h-3.5 w-3.5" />{running ? "验证中" : "开始验证"}</Button></div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>覆盖 {checks.length} 个接口</span><span>{passed}/{checks.length} 已通过</span></div>
        <div className="overflow-hidden rounded-md border border-border/70">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-9 sm:w-10" />
              <col />
              <col className="w-9 min-[760px]:w-32 min-[900px]:w-44" />
              <col className="w-14 min-[760px]:w-20 min-[900px]:w-40" />
              <col className="w-11 sm:w-[4.5rem]" />
            </colgroup>
            <thead className="border-b border-border/70 bg-muted/35 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-center font-medium"><span className="sr-only">状态</span></th>
                <th className="px-2 py-2 font-medium">接口</th>
                <th className="px-2 py-2 font-medium max-[760px]:sr-only">请求 ID</th>
                <th className="px-2 py-2 font-medium">结果</th>
                <th className="px-2 py-2 text-right font-medium"><span className="max-[520px]:sr-only">详情</span></th>
              </tr>
            </thead>
            <tbody>{checks.map((item) => (
              <tr key={item.id} className="border-b border-border/50 align-top last:border-0">
                <td className="px-2 py-2.5 text-center">
                  {item.state === "running" ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" /> : item.state === "passed" ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" /> : item.state === "failed" ? <CircleAlert className="mx-auto h-4 w-4 text-destructive" /> : <span className="text-[10px] text-muted-foreground">待</span>}
                </td>
                <td className="min-w-0 px-2 py-2">
                  <div className="truncate font-medium text-foreground" title={item.label}>{item.label}</div>
                  <div className="mt-0.5 break-words font-mono text-[10px] leading-tight text-muted-foreground">{item.path}</div>
                </td>
                <td className="px-1 py-1.5 min-[760px]:px-2"><RequestIdCell requestId={item.requestId} /></td>
                <td className={cn("px-2 py-2 text-muted-foreground", item.state === "failed" && "text-destructive")}>
                  <span className="font-medium">{item.status ?? "-"}</span>
                  <span className="min-[900px]:inline hidden">{item.status ? " · " : ""}{item.detail || "-"}</span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {item.exchange ? <Button type="button" variant="outline" size="sm" className="h-7 w-7 shrink-0 px-0 text-foreground hover:text-foreground sm:w-auto sm:px-2" onClick={() => onDetailSelect(item.exchange ?? null)} aria-label={item.label + "详情"} title="查看详情"><Eye className="block h-4 w-4 shrink-0 text-emerald-500 sm:mr-1" aria-hidden /><span className="hidden sm:inline">详情</span></Button> : <span className="text-muted-foreground">-</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {summary?.includes("完整验证通过") ? <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">{summary}</p> : null}
        {!ready ? <p className="text-xs text-muted-foreground">请先选择可用 APIKey 和服务端点。</p> : null}
      </CardContent>
    </Card>
  )
}
