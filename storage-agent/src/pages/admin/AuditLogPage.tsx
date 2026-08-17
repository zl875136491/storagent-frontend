import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Copy, Filter, RefreshCw, Search } from "lucide-react"
import { Navigate } from "react-router-dom"

import { fetchAuditEventOptionsApi, fetchAuditEventsApi, type AuditEventItem, type AuditEventOptionsResponse, type AuditEventQueryParams } from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { BrandLoading } from "../../components/BrandLoading"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { formatDateTime } from "../../lib/format"
import { cn } from "../../lib/utils"

const PAGE_SIZE = 50
const SELECT_CLASS = "h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
type FilterState = Pick<AuditEventQueryParams, "action" | "actor" | "region" | "resource" | "success"> & { start_at: string; end_at: string }

function datetimeInput(date: Date): string { return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) }
function inputToIso(value: string): string | undefined { if (!value) return undefined; const parsed = new Date(value + ":00+08:00"); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString() }
function initialFilters(): FilterState { const end = new Date(); return { start_at: datetimeInput(new Date(end.getTime() - 7 * 86400000)), end_at: datetimeInput(end) } }

function EventResult({ success }: { success: boolean }) { return success ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />成功</span> : <span className="inline-flex items-center gap-1 text-destructive"><CircleAlert className="h-3.5 w-3.5" aria-hidden />失败</span> }

function AuditDetail({ event }: { event: AuditEventItem | null }) {
  const [copied, setCopied] = useState(false)
  if (!event) return <Card className="h-full min-h-[30rem] rounded-lg shadow-none"><CardContent className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">选择一条审计事件查看详细记录。</CardContent></Card>
  let detail = event.detail
  try { detail = JSON.stringify(JSON.parse(event.detail), null, 2) } catch { /* Detail may be a plain-text audit message. */ }
  const copyResource = async () => { if (!event.resource) return; const ok = await navigator.clipboard?.writeText(event.resource).then(() => true).catch(() => false); if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1200) } }
  return <Card className="h-full min-h-[30rem] rounded-lg shadow-none"><CardContent className="flex h-full min-h-0 flex-col p-5"><div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 pb-4"><div className="min-w-0"><h2 className="text-base font-semibold text-foreground">审计事件详情</h2><p className="mt-1 font-mono text-xs text-muted-foreground">{event.action}</p></div><EventResult success={event.success} /></div><dl className="mt-4 grid shrink-0 gap-4 sm:grid-cols-2"><div><dt className="text-[11px] text-muted-foreground">发生时间</dt><dd className="mt-1 text-xs">{formatDateTime(event.created_at)}</dd></div><div><dt className="text-[11px] text-muted-foreground">区域</dt><dd className="mt-1 text-xs">{event.region || "-"}</dd></div><div><dt className="text-[11px] text-muted-foreground">操作者</dt><dd className="mt-1 text-xs">{event.actor || "-"}</dd></div><div><dt className="text-[11px] text-muted-foreground">资源</dt><dd className="mt-1 flex items-center gap-1 text-xs"><span className="min-w-0 break-all">{event.resource || "-"}</span>{event.resource ? <Button type="button" variant="ghost" size="icon-sm" title="复制资源标识" onClick={copyResource}><Copy className={cn("h-3.5 w-3.5", copied && "text-emerald-600")} aria-hidden /></Button> : null}</dd></div></dl><div className="mt-5 flex min-h-0 flex-1 flex-col"><div className="mb-2 text-sm font-semibold text-foreground">详情</div><pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border/70 bg-muted/25 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{detail || "无额外详情"}</pre></div></CardContent></Card>
}

export default function AuditLogPage() {
  const { user, accessToken } = useAuth()
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [options, setOptions] = useState<AuditEventOptionsResponse>({ actions: [], actors: [], regions: [] })
  const [events, setEvents] = useState<AuditEventItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AuditEventItem | null>(null)
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => setFilters((current) => ({ ...current, [key]: value }))
  const query = useCallback((targetPage: number) => {
    const params: AuditEventQueryParams = { start_at: inputToIso(filters.start_at), end_at: inputToIso(filters.end_at), action: filters.action, actor: filters.actor, region: filters.region, resource: filters.resource?.trim() || undefined, success: filters.success, page: targetPage, page_size: PAGE_SIZE }
    setLoading(true); setError(null)
    return fetchAuditEventsApi(params, accessToken ?? undefined).then((response) => { setEvents(response.data); setTotal(response.total); setPage(response.page); setSelected((current) => response.data.find((item) => item.id === current?.id) ?? null) }).catch((reason) => { const message = reason instanceof Error ? reason.message : "无法读取审计日志"; setError(message); showErrorToast(message) }).finally(() => setLoading(false))
  }, [accessToken, filters])
  const initialLoad = useRef(false)
  useEffect(() => { if (!user?.is_admin) return; void fetchAuditEventOptionsApi(accessToken ?? undefined).then(setOptions).catch(() => undefined) }, [accessToken, user?.is_admin])
  useEffect(() => {
    if (!user?.is_admin || initialLoad.current) return
    initialLoad.current = true
    void Promise.resolve().then(() => query(1))
  }, [query, user?.is_admin])
  if (!user?.is_admin) return <Navigate to="/docs/overview" replace />
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const summary = total ? "共 " + total + " 条，第 " + page + " / " + totalPages + " 页" : "暂无符合条件的审计事件"
  return <div className="mx-auto flex h-full min-h-[680px] max-w-8xl flex-col pb-10"><div className="mb-4 shrink-0"><h1 className="text-lg font-semibold text-foreground">审计日志</h1><p className="mt-1 text-xs text-muted-foreground">查询系统管理、存储配置与关键安全操作的持久化审计记录。</p></div><Card className="mb-4 shrink-0 rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-sky-600 dark:text-sky-300" aria-hidden />筛选条件</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div><Label htmlFor="audit-start">开始时间</Label><Input id="audit-start" className="mt-1.5" type="datetime-local" value={filters.start_at} onChange={(event) => update("start_at", event.target.value)} /></div><div><Label htmlFor="audit-end">结束时间</Label><Input id="audit-end" className="mt-1.5" type="datetime-local" value={filters.end_at} onChange={(event) => update("end_at", event.target.value)} /></div><div><Label htmlFor="audit-action">操作</Label><select id="audit-action" className={cn(SELECT_CLASS, "mt-1.5 w-full")} value={filters.action ?? ""} onChange={(event) => update("action", event.target.value || undefined)}><option value="">全部操作</option>{options.actions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div><Label htmlFor="audit-actor">操作者</Label><select id="audit-actor" className={cn(SELECT_CLASS, "mt-1.5 w-full")} value={filters.actor ?? ""} onChange={(event) => update("actor", event.target.value || undefined)}><option value="">全部操作者</option>{options.actors.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div><Label htmlFor="audit-region">区域</Label><select id="audit-region" className={cn(SELECT_CLASS, "mt-1.5 w-full")} value={filters.region ?? ""} onChange={(event) => update("region", event.target.value || undefined)}><option value="">全部区域</option>{options.regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div><Label htmlFor="audit-result">结果</Label><select id="audit-result" className={cn(SELECT_CLASS, "mt-1.5 w-full")} value={filters.success === undefined ? "" : String(filters.success)} onChange={(event) => update("success", event.target.value === "" ? undefined : event.target.value === "true")}><option value="">全部结果</option><option value="true">成功</option><option value="false">失败</option></select></div><div className="sm:col-span-2"><Label htmlFor="audit-resource">资源关键字</Label><div className="mt-1.5 flex gap-2"><Input id="audit-resource" value={filters.resource ?? ""} placeholder="按资源名称或标识筛选" onChange={(event) => update("resource", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void query(1) }} /><Button type="button" size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => void query(1)} disabled={loading}><Search className="h-3.5 w-3.5" aria-hidden />查询</Button></div></div></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4"><span className="text-xs text-muted-foreground">{summary}</span><Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void query(page)} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />刷新</Button></div></CardContent></Card><section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]"><Card className="min-w-0 rounded-lg shadow-none"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="w-20">结果</TableHead><TableHead>操作</TableHead><TableHead>操作者</TableHead><TableHead>资源</TableHead><TableHead>区域</TableHead><TableHead className="w-40">时间</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={6} className="h-52 text-center"><BrandLoading compact label="正在读取审计日志" /></TableCell></TableRow> : error ? <TableRow><TableCell colSpan={6} className="h-52 text-center text-destructive">{error}</TableCell></TableRow> : events.length === 0 ? <TableRow><TableCell colSpan={6} className="h-52 text-center text-muted-foreground">没有符合条件的审计事件。</TableCell></TableRow> : events.map((event) => <TableRow key={event.id} data-state={selected?.id === event.id ? "selected" : undefined} className="cursor-pointer" onClick={() => setSelected(event)}><TableCell><EventResult success={event.success} /></TableCell><TableCell className="max-w-48 font-mono text-[11px]">{event.action}</TableCell><TableCell className="max-w-28 truncate" title={event.actor}>{event.actor}</TableCell><TableCell className="max-w-40 truncate" title={event.resource}>{event.resource}</TableCell><TableCell>{event.region || "-"}</TableCell><TableCell>{formatDateTime(event.created_at)}</TableCell></TableRow>)}</TableBody></Table><div className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-3"><span className="text-xs text-muted-foreground">{summary}</span><div className="flex gap-1"><Button type="button" variant="outline" size="icon-sm" title="上一页" disabled={loading || page <= 1} onClick={() => void query(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button><Button type="button" variant="outline" size="icon-sm" title="下一页" disabled={loading || page >= totalPages} onClick={() => void query(page + 1)}><ChevronRight className="h-4 w-4" aria-hidden /></Button></div></div></CardContent></Card><AuditDetail event={selected} /></section></div>
}
