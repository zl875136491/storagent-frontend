import { useCallback, useEffect, useMemo, useState } from "react"
import { Navigate, NavLink, useLocation } from "react-router-dom"
import { Check, CheckCircle2, CircleAlert, Copy, Download, Eye, FileSearch, KeyRound, RefreshCw, Server, ShieldCheck, Terminal } from "lucide-react"
import hljs from "highlight.js"

import { diagnosticScriptUrl, fetchDemoApiKeysApi, fetchDiagnosticRunsApi, type DemoAPIKey, type DiagnosticRun } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { DocVersionSwitcher, useDocVersion } from "@/components/docs/version-switcher"
import { StorageApiVerificationPanel, type VerificationDetail } from "@/components/guides/StorageApiVerificationPanel"
import { GuideBackendSelector } from "@/components/guides/guide-backend-selector"
import { GuideEndpointsProvider, useGuideDemoBackendSelection } from "@/components/guides/guide-endpoints-context"
import { BrandLoading } from "@/components/BrandLoading"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { copyTextToClipboard } from "@/lib/copy-to-clipboard"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "../../lib/useDocumentTitle"

type ServiceView = "verification" | "diagnostics"

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
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">选择当前账号可使用的 APIKey 对象。浏览器只传递对象 ID，服务端在每次请求前解析并校验密钥。</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="service-operation-api-key">APIKey 对象</Label>
        <select id="service-operation-api-key" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={value} disabled={loading} onChange={(event) => onChange(event.target.value)}>
          <option value="">{loading ? "正在读取可用 APIKey..." : "选择 APIKey"}</option>
          {keys.map((item) => <option key={item.id} value={item.id}>{item.application.shown_name || item.application.name} · {item.key_hint}</option>)}
        </select>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{error ?? (keys.length ? "APIKey 明文不会返回、保存或出现在浏览器网络请求中。" : "没有可用于验证的 APIKey 对象。")}</p>
    </div>
  )
}

function DetailValue({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  return <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap break-words">{value === undefined ? emptyLabel : JSON.stringify(value, null, 2)}</pre>
}

function VerificationDetailPanel({ detail }: { detail: VerificationDetail | null }) {
  return (
    <Card className="h-full min-h-0 rounded-lg shadow-none" aria-live="polite">
      <CardContent className="flex h-full min-h-0 flex-col p-5">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
          <div className="min-w-0"><h2 className="text-base font-semibold text-foreground">接口调用详情</h2><p className="mt-1 truncate text-xs text-muted-foreground" title={detail ? detail.path : undefined}>{detail ? <>{detail.label} · <span className="font-mono">{detail.path}</span></> : "选择一条已完成的接口测试以查看请求和返回内容。"}</p></div>
          <div className="shrink-0 text-right text-xs text-muted-foreground"><div>{detail?.status ? "HTTP " + detail.status : "尚未选择接口"}</div><div className="mt-1 max-w-36 truncate font-mono" title={detail?.requestId}>{detail?.requestId || "-"}</div></div>
        </div>
        <div className="mt-4 flex min-h-0 flex-[3] flex-col"><h3 className="mb-2 shrink-0 text-sm font-semibold text-foreground">Request</h3><DetailValue value={detail?.request} emptyLabel="尚未选择接口测试" /></div>
        <div className="mt-4 flex min-h-0 flex-[7] flex-col"><h3 className="mb-2 shrink-0 text-sm font-semibold text-foreground">Response</h3><DetailValue value={detail ? (detail.response ?? { error: detail.result }) : undefined} emptyLabel="尚未选择接口测试" /></div>
        <p className="mt-3 shrink-0 text-xs text-muted-foreground">{detail ? <>记录时间：{new Date(detail.capturedAt).toLocaleString()} · 结果：{detail.result || "-"}</> : "执行验证后，可选择任一完成项查看详细交换记录。"}</p>
      </CardContent>
    </Card>
  )
}

function DiagnosticStatus({ value }: { value: DiagnosticRun["overall_status"] }) {
  const passed = value === "passed"
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", passed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : value === "partial" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>{passed ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <CircleAlert className="h-3.5 w-3.5" aria-hidden />}{passed ? "通过" : value === "partial" ? "部分通过" : "失败"}</span>
}

function DiagnosticRunIdCell({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const copiedSuccessfully = await copyTextToClipboard(runId)
    if (!copiedSuccessfully) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return <div className="flex min-w-0 items-center gap-1"><span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground max-[760px]:hidden" title={runId}>{runId}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(event) => { event.stopPropagation(); void copy() }} aria-label="复制诊断 ID" title={copied ? "已复制" : "复制诊断 ID"}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</Button></div>
}

function DiagnosticRunStateIcon({ value }: { value: DiagnosticRun["overall_status"] }) {
  return value === "passed" ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label="通过" /> : <CircleAlert className={cn("mx-auto h-4 w-4", value === "partial" ? "text-amber-600" : "text-destructive")} aria-label={value === "partial" ? "部分通过" : "失败"} />
}

function parseDiagnosticDetail(detail: string) {
  const jsonStart = detail.indexOf("{")
  if (jsonStart < 0) return { message: detail }

  try {
    return {
      message: detail.slice(0, jsonStart).replace(/[：:]\s*$/, "").trim(),
      response: JSON.parse(detail.slice(jsonStart)),
    }
  } catch {
    return { message: detail }
  }
}

function HighlightedJson({ value, className }: { value: unknown; className?: string }) {
  const source = useMemo(() => JSON.stringify(value, null, 2), [value])
  const highlighted = useMemo(() => hljs.highlight(source, { language: "json" }).value, [source])

  return <pre className={cn("min-h-0 overflow-auto rounded-md border border-border/70 bg-muted/20 p-4 font-mono text-[13px] leading-6 text-foreground", className)}><code className="hljs language-json" dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
}

function StructuredDiagnosticLog({ run }: { run: DiagnosticRun }) {
  const source = useMemo(() => JSON.stringify({
    run_id: run.run_id,
    app_id: run.app_name,
    api_version: run.api_version,
    source_host: run.source_host,
    completed_at: run.created_at,
    overall_status: run.overall_status,
    checks: run.checks.map((check) => ({
      name: check.name,
      status: check.status,
      latency_ms: check.latency_ms,
      ...parseDiagnosticDetail(check.detail),
    })),
  }, null, 2), [run])
  return <HighlightedJson value={JSON.parse(source)} className="flex-1" />
}

function DiagnosticWorkspace({ version, accessToken }: { version: "v1" | "v2"; accessToken?: string }) {
  const [runs, setRuns] = useState<DiagnosticRun[]>([])
  const [selected, setSelected] = useState<DiagnosticRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [appFilter, setAppFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | DiagnosticRun["overall_status"]>("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchDiagnosticRunsApi(accessToken)
      const visible = response.data.filter((item) => item.api_version === version)
      setRuns(visible)
      setSelected((current) => visible.find((item) => item.id === current?.id) ?? visible[0] ?? null)
    } finally {
      setLoading(false)
    }
  }, [accessToken, version])

  useEffect(() => { void load() }, [load])

  const appOptions = useMemo(() => [...new Set(runs.map((run) => run.app_name))].sort((left, right) => left.localeCompare(right)), [runs])
  const filteredRuns = useMemo(() => runs.filter((run) => (!appFilter || run.app_name === appFilter) && (!statusFilter || run.overall_status === statusFilter)), [appFilter, runs, statusFilter])

  useEffect(() => {
    setSelected((current) => filteredRuns.find((run) => run.id === current?.id) ?? filteredRuns[0] ?? null)
  }, [filteredRuns])

  const totalChecks = selected?.checks.length ?? 0
  const passedChecks = selected?.checks.filter((check) => check.status === "passed").length ?? 0
  const skippedChecks = selected?.checks.filter((check) => check.status === "skipped").length ?? 0
  const failedChecks = selected?.checks.filter((check) => check.status === "failed").length ?? 0
  const completedChecks = passedChecks + skippedChecks + failedChecks
  const scriptUrl = diagnosticScriptUrl(version)
  // The page itself may use a same-origin path such as /server/bj. A shell
  // runs outside this browser, so it must receive the complete host URL.
  const executeCommand = "curl -fsSL " + JSON.stringify(new URL(scriptUrl, window.location.origin).toString()) + " | sh"

  const copyExecuteCommand = async () => {
    const copied = await copyTextToClipboard(executeCommand)
    if (!copied) return
    setCopiedCommand(true)
    window.setTimeout(() => setCopiedCommand(false), 2000)
  }

  return (
    <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(21rem,0.75fr)_minmax(0,1.25fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <Card className="shrink-0 rounded-lg shadow-none"><CardContent className="p-5">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Terminal className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div><h2 className="text-base font-semibold">{version.toUpperCase()} 调用方接入诊断</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">下载脚本，或复制命令后在调用方后端交互式执行。仅需基础地址与 APIKey；它会逐项检查 DNS、网关路径、认证、版本契约与存储读写，并回传脱敏诊断记录。</p></div></div><a href={scriptUrl} download title="下载自诊断脚本" className="mt-7 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Download className="h-3.5 w-3.5" aria-hidden />下载</a></div>
          <div className="mt-4 flex min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted/30"><code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-[11px] leading-5 text-foreground">{executeCommand}</code><Button type="button" size="sm" variant="outline" className={cn("h-auto shrink-0 rounded-none border-y-0 border-r-0 px-3", copiedCommand && "text-emerald-600")} title={copiedCommand ? "复制成功" : "复制执行命令"} onClick={() => void copyExecuteCommand()}>{copiedCommand ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copiedCommand ? "复制成功" : "复制"}</Button></div>
        </CardContent></Card>
        <Card className="min-h-0 flex-1 rounded-lg shadow-none"><CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="shrink-0 border-b border-border/70 px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="h-4 w-4 text-primary" aria-hidden />诊断记录</div><Button type="button" size="icon-sm" variant="outline" title="刷新诊断记录" aria-label="刷新诊断记录" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden /></Button></div><div className="mt-3 grid grid-cols-2 gap-2"><select aria-label="按应用筛选诊断记录" className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={appFilter} onChange={(event) => setAppFilter(event.target.value)}><option value="">全部应用</option>{appOptions.map((appName) => <option key={appName} value={appName}>{appName}</option>)}</select><select aria-label="按状态筛选诊断记录" className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | DiagnosticRun["overall_status"])}><option value="">全部状态</option><option value="passed">通过</option><option value="partial">部分通过</option><option value="failed">失败</option></select></div></div>
          {loading && runs.length === 0 ? <BrandLoading compact label="正在读取诊断记录" /> : runs.length === 0 ? <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">暂无回传记录。脚本完成后会自动出现在这里。</div> : filteredRuns.length === 0 ? <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">没有符合当前筛选条件的诊断记录。</div> : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full table-fixed text-left text-xs"><colgroup><col className="w-9 sm:w-10" /><col /><col className="w-9 min-[760px]:w-32 min-[900px]:w-44" /><col className="w-14 min-[760px]:w-20 min-[900px]:w-32" /><col className="w-11 sm:w-[4.5rem]" /></colgroup><thead className="sticky top-0 z-10 border-b border-border/70 bg-muted/35 text-muted-foreground"><tr><th className="px-2 py-2 text-center font-medium"><span className="sr-only">状态</span></th><th className="px-2 py-2 font-medium">应用</th><th className="px-2 py-2 font-medium max-[760px]:sr-only">诊断 ID</th><th className="px-2 py-2 font-medium">结果</th><th className="px-2 py-2 text-right font-medium"><span className="max-[520px]:sr-only">详情</span></th></tr></thead><tbody>{filteredRuns.map((run) => <tr key={run.id} className={cn("cursor-pointer border-b border-border/50 align-middle transition-colors hover:bg-muted/30 last:border-0", selected?.id === run.id && "bg-primary/5")} onClick={() => setSelected(run)}><td className="px-2 py-2 text-center"><DiagnosticRunStateIcon value={run.overall_status} /></td><td className="min-w-0 px-2 py-2"><div className="truncate font-medium text-foreground" title={run.app_name}>{run.app_name}</div><div className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">{run.api_version.toUpperCase()} · <time dateTime={run.created_at} title={formatDateTime(run.created_at)}>{formatDateTime(run.created_at)}</time></div></td><td className="px-1 py-1 min-[760px]:px-2"><DiagnosticRunIdCell runId={run.run_id} /></td><td className={cn("px-2 py-2 text-muted-foreground", run.overall_status === "failed" && "text-destructive", run.overall_status === "partial" && "text-amber-600")}><span className="font-medium">{run.overall_status === "passed" ? "通过" : run.overall_status === "partial" ? "部分通过" : "失败"}</span><span className="hidden min-[900px]:inline">{" · "}{run.checks.filter((check) => check.status === "passed").length} 通过 / {run.checks.length} 项</span></td><td className="px-2 py-1 text-right"><Button type="button" variant="outline" size="sm" className="h-7 w-7 shrink-0 px-0 text-foreground hover:text-foreground sm:w-auto sm:px-2" onClick={(event) => { event.stopPropagation(); setSelected(run) }} aria-label={run.app_name + "诊断详情"} title="查看详情"><Eye className="block h-4 w-4 shrink-0 text-emerald-500 sm:mr-1" aria-hidden /><span className="hidden sm:inline">详情</span></Button></td></tr>)}</tbody></table></div>}
        </CardContent></Card>
      </div>
      <Card className="h-full min-h-0 rounded-lg shadow-none"><CardContent className="flex h-full min-h-0 flex-col p-5">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 pb-4"><div className="min-w-0"><h2 className="text-base font-semibold">诊断详情</h2><p className="mt-1 truncate text-[11px] text-muted-foreground">{selected ? `${selected.app_name} · ${selected.run_id}` : "选择一条回传记录查看每项检查结果。"}</p></div>{selected ? <DiagnosticStatus value={selected.overall_status} /> : null}</div>
        {selected ? <div className="mt-4 flex min-h-0 flex-1 flex-col"><div className="shrink-0"><div className="flex items-center gap-3"><div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="诊断检查完成状态" aria-valuenow={completedChecks} aria-valuemin={0} aria-valuemax={totalChecks}>{selected.checks.map((check) => <span key={check.name} className={cn("h-full border-r border-background/70 last:border-r-0", check.status === "passed" ? "bg-emerald-500" : check.status === "skipped" ? "bg-amber-500" : "bg-destructive")} style={{ width: `${100 / totalChecks}%` }} title={`${check.name}: ${check.status === "passed" ? "通过" : check.status === "skipped" ? "跳过" : "失败"}`} />)}</div><span className="text-xs tabular-nums text-muted-foreground">{completedChecks} / {totalChecks} 已完成</span></div><div className="mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] tabular-nums"><span className="text-emerald-600">{passedChecks} 通过</span><span className="text-amber-600">{skippedChecks} 跳过</span><span className="text-destructive">{failedChecks} 失败</span></div><div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalChecks}, minmax(0, 1fr))` }} aria-label="诊断检查流程">{selected.checks.map((check, index) => <div key={check.name} className="relative min-w-0 text-center">{index > 0 ? <i className="absolute right-1/2 top-3 h-px w-full bg-border" aria-hidden /> : null}<span className={cn("relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[10px] font-medium", check.status === "passed" ? "border-emerald-500 text-emerald-600" : check.status === "skipped" ? "border-amber-500 text-amber-600" : "border-destructive text-destructive")}>{check.status === "passed" ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground" title={check.name}>{check.name}</span></div>)}</div></div><div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"><div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{selected.checks.map((check) => { const detail = parseDiagnosticDetail(check.detail); return <div key={check.name} className="rounded-md border border-border/70 px-3 py-3 text-[13px] leading-6"><div className="flex items-center justify-between gap-3"><span className="font-medium">{check.name}</span><span className={cn("shrink-0", check.status === "passed" ? "text-emerald-600" : check.status === "skipped" ? "text-amber-600" : "text-destructive")}>{check.status === "passed" ? "通过" : check.status === "skipped" ? "跳过" : "失败"}{check.latency_ms ? ` · ${check.latency_ms} ms` : ""}</span></div><div className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{detail.message}</div>{detail.response !== undefined ? <HighlightedJson value={detail.response} className="mt-3 bg-muted/20" /> : null}</div>})}</div><div className="shrink-0 text-[13px] font-semibold">结构化诊断日志</div><StructuredDiagnosticLog run={selected} /></div></div> : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><ShieldCheck className="h-9 w-9 text-muted-foreground/60" aria-hidden /><p>等待选择诊断记录</p></div>}
      </CardContent></Card>
    </section>
  )
}

function ServiceOperationsWorkspace({ view }: { view: ServiceView }) {
  const { accessToken } = useAuth()
  const location = useLocation()
  const [version] = useDocVersion()
  const [apiKeyId, setApiKeyId] = useState("")
  const [selectedDetail, setSelectedDetail] = useState<VerificationDetail | null>(null)
  const selectApiKey = useCallback((next: string) => setApiKeyId(next), [])
  const { base, setBase, listLoading, listError } = useGuideDemoBackendSelection()

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-8xl flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-lg font-semibold text-foreground">服务运维</h1><p className="mt-1 text-xs text-muted-foreground">受控接口验收与调用方接入诊断共用当前 API 版本上下文。</p></div>
        <div className="flex flex-col items-end gap-2"><DocVersionSwitcher className="shrink-0" /><div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="服务运维视图"><NavLink to={{ pathname: "/admin/service-operations/verification", search: location.search }} role="tab" aria-selected={view === "verification"} className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs", view === "verification" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />接口完整验证</NavLink><NavLink to={{ pathname: "/admin/service-operations/diagnostics", search: location.search }} role="tab" aria-selected={view === "diagnostics"} className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs", view === "diagnostics" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}><Terminal className="h-3.5 w-3.5" aria-hidden />调用方接入诊断</NavLink></div></div>
      </div>
      {view === "diagnostics" ? <DiagnosticWorkspace version={version} accessToken={accessToken ?? undefined} /> : <>
        <Card className="mb-4 shrink-0 rounded-lg shadow-none"><CardContent className="p-5"><div className="mb-3"><h2 className="text-base font-semibold text-foreground">运行配置</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">修改版本、端点或 APIKey 后，将从新的验证上下文开始执行。</p></div><div className="grid items-stretch gap-4 xl:grid-cols-[minmax(20rem,0.78fr)_minmax(0,1.22fr)]"><ApiKeyRunSelector value={apiKeyId} onChange={selectApiKey} /><div className="flex h-full min-h-0 flex-col rounded-lg border border-border/70 bg-background p-4"><div className="flex items-start gap-3"><Server className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden /><div className="min-w-0"><h2 className="text-sm font-semibold text-foreground">目标服务</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">使用公共探测接口选择可达网关。当前选择会用于本次完整验证的所有请求。</p></div></div><div className="mt-4"><GuideBackendSelector value={base} onChange={setBase} /></div>{listLoading ? <p className="mt-3 text-[11px] text-muted-foreground">正在探测后端健康状态。</p> : null}{listError ? <p className="mt-3 text-[11px] text-destructive">{listError}</p> : null}</div></div></CardContent></Card>
        <section className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]"><div className="min-h-0 min-w-0 overflow-hidden"><StorageApiVerificationPanel version={version} baseURL={base} apiKeyId={apiKeyId} accessToken={accessToken ?? undefined} onDetailSelect={setSelectedDetail} /></div><div className="min-h-0 overflow-hidden"><VerificationDetailPanel detail={selectedDetail} /></div></section>
      </>}
    </div>
  )
}

export default function ServiceOperationsPage({ view }: { view: ServiceView }) {
  useDocumentTitle("服务运维")
  const { user } = useAuth()
  if (!canOperateService(user)) return <Navigate to="/data/basic/region" replace />
  return <GuideEndpointsProvider><ServiceOperationsWorkspace view={view} /></GuideEndpointsProvider>
}
