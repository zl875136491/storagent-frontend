import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { KeyRound, Server } from "lucide-react"

import { fetchDemoApiKeysApi, type DemoAPIKey } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { DocVersionSwitcher, useDocVersion } from "@/components/docs/version-switcher"
import { StorageApiVerificationPanel, type VerificationDetail } from "@/components/guides/StorageApiVerificationPanel"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { GuideEndpointsProvider, useGuideDemoBackendSelection } from "@/components/guides/guide-endpoints-context"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

function canOperateService(user: ReturnType<typeof useAuth>["user"]) {
  return user?.is_admin === true || user?.roles.some((role) => role.name === "运维管理员") === true
}

function ApiKeyRunSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { accessToken } = useAuth()
  const [keys, setKeys] = useState<DemoAPIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchDemoApiKeysApi(accessToken ?? undefined)
      .then((response) => {
        if (!active) return
        setKeys(response.data)
        if (value && !response.data.some((item) => item.id === value)) onChange("")
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "无法读取可用 APIKey"))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accessToken, onChange, value])

  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">验证身份</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            选择当前账号可使用的 APIKey 对象。浏览器只传递对象 ID，服务端在每次请求前解析并校验密钥。
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="service-operation-api-key">APIKey 对象</Label>
        <select
          id="service-operation-api-key"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{loading ? "正在读取可用 APIKey..." : "选择 APIKey"}</option>
          {keys.map((item) => (
            <option key={item.id} value={item.id}>
              {item.application.shown_name || item.application.name} · {item.key_hint}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {error ?? (keys.length ? "APIKey 明文不会返回、保存或出现在浏览器网络请求中。" : "没有可用于验证的 APIKey 对象。")}
      </p>
    </div>
  )
}

function DetailValue({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{value === undefined ? "-" : JSON.stringify(value, null, 2)}</pre>
}

function VerificationDetailPanel({ detail }: { detail: VerificationDetail }) {
  return (
    <section className="mt-6 border-t border-border/70 pt-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">接口调用详情</h2>
          <p className="mt-1 text-sm text-muted-foreground">{detail.label} · <span className="font-mono text-xs">{detail.path}</span></p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{detail.status ? "HTTP " + detail.status : "未收到 HTTP 响应"}</div>
          <div className="mt-1 font-mono">{detail.requestId || "无 request ID"}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Request</h3>
          <DetailValue value={detail.request} />
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Response</h3>
          <DetailValue value={detail.response ?? { error: detail.result }} />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">记录时间：{new Date(detail.capturedAt).toLocaleString()} · 结果：{detail.result || "-"}</p>
    </section>
  )
}

function ServiceOperationsWorkspace() {
  const { accessToken } = useAuth()
  const [version] = useDocVersion()
  const [apiKeyId, setApiKeyId] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<VerificationDetail | null>(null)
  const selectApiKey = useCallback((next: string) => setApiKeyId(next), [])
  const { base, setBase, listLoading, listError } = useGuideDemoBackendSelection()

  return (
    <div className="mx-auto max-w-7xl pb-10">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">服务运维</h1>
            <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary">真实接口验证</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            面向存储服务的受控验收工作台。选择目标网关和 APIKey 对象后，系统会执行当前版本全部存储接口，并保留每一步的 HTTP 状态与请求 ID。
          </p>
        </div>
        <DocVersionSwitcher className="shrink-0" />
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(19rem,0.75fr)_minmax(0,1.25fr)]">
        <Card className="rounded-lg shadow-none">
          <CardContent className="space-y-5 p-5">
            <div><h2 className="text-base font-semibold text-foreground">运行配置</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">修改版本、端点或 APIKey 后，将从新的验证上下文开始执行。</p></div>
            <ApiKeyRunSelector value={apiKeyId} onChange={selectApiKey} />
            <div className="rounded-lg border border-border/70 bg-background p-4"><div className="flex items-start gap-3"><Server className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden /><div className="min-w-0"><h2 className="text-sm font-semibold text-foreground">目标服务</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">使用公共探测接口选择可达网关。当前选择会用于本次完整验证的所有请求。</p></div></div><div className="mt-4"><GuideBackendSelector value={base} onChange={setBase} /></div>{listLoading ? <p className="mt-3 text-[11px] text-muted-foreground">正在探测后端健康状态。</p> : null}{listError ? <p className="mt-3 text-[11px] text-destructive">{listError}</p> : null}</div>
          </CardContent>
        </Card>

        <div className="min-w-0"><StorageApiVerificationPanel version={version} baseURL={base} apiKeyId={apiKeyId} accessToken={accessToken ?? undefined} onDetailSelect={setSelectedDetail} /></div>
      </section>
      {selectedDetail ? <VerificationDetailPanel detail={selectedDetail} /> : null}
    </div>
  )
}

export default function ServiceOperationsPage() {
  const { user } = useAuth()
  if (!canOperateService(user)) return <Navigate to="/data/basic/region" replace />
  return <GuideEndpointsProvider><ServiceOperationsWorkspace /></GuideEndpointsProvider>
}
