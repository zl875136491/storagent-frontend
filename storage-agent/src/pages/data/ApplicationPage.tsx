import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, Check, Circle, Expand, Gauge, Loader2, Settings2, XCircle } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import {
  approveApplicationStream,
  approvalStepLabel,
  createExpansionRequestApi,
  createApplicationApi,
  fetchApplicationsApi,
  fetchExpansionRequestsApi,
  fetchQuotaAlertRuleApi,
  reviewExpansionRequestApi,
  updateQuotaAlertRuleApi,
  updateApplicationQuotaApi,
} from "../../api/client"
import type {
  Application,
  ApplicationApprovalSseEvent,
  ApplicationApprovalSseStatus,
  ApplicationCreateRequest,
  ExpansionRequest,
  QuotaAlertRule,
} from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { useNavigationLeaveBlock } from "../../contexts/NavigationLeaveBlockContext"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Progress } from "../../components/ui/progress"
import { formatDateTime } from "../../lib/format"
import { cn } from "../../lib/utils"
import { BrandLoading } from "../../components/BrandLoading"

type ApprovalPhase = "confirm" | "streaming" | "finished"

const GIB = 1024 ** 3

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** index
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`
}

function quotaPercent(app: Application): number {
  if (!app.quota_bytes) return 0
  const ratio = Number.isFinite(app.quota_usage_ratio)
    ? app.quota_usage_ratio
    : app.quota_usage_bytes / app.quota_bytes
  return Math.min(100, Math.max(0, ratio * 100))
}

function quotaColor(percent: number): string {
  if (percent > 90) return "bg-rose-500"
  if (percent > 75) return "bg-amber-400"
  if (percent > 50) return "bg-sky-500"
  return "bg-emerald-500"
}

function statusStyle(status: ApplicationApprovalSseStatus): string {
  if (status === "running") {
    return "border-l-amber-500 bg-amber-500/5 text-foreground"
  }
  if (status === "ok" || status === "success" || status === "skipped") {
    return "border-l-emerald-500 bg-emerald-500/5 text-foreground"
  }
  if (status === "failed") {
    return "border-l-destructive bg-destructive/5 text-destructive"
  }
  return "border-l-border bg-muted/40"
}

/** running 且为当前最后一条时转动；该 running 步骤已结束时改为绿色完整圆环，表示该阶段已完成 */
function StatusGlyph({
  status,
  isRunningActive,
}: {
  status: ApplicationApprovalSseStatus
  isRunningActive: boolean
}) {
  if (status === "running") {
    if (isRunningActive) {
      return (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-600"
          aria-hidden
        />
      )
    }
    return (
      <Circle
        className="h-3.5 w-3.5 shrink-0 fill-none text-emerald-600"
        strokeWidth={2.5}
        aria-hidden
      />
    )
  }
  if (status === "ok" || status === "success" || status === "skipped") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
  }
  return null
}

export default function ApplicationPage() {
  const { accessToken, user } = useAuth()
  const canApprove = hasPermission(user, PERMISSIONS.applicationManage)
  const canManageQuota = hasPermission(user, PERMISSIONS.applicationQuotaManage)
  const { beginBlock, endBlock } = useNavigationLeaveBlock()
  const [searchParams, setSearchParams] = useSearchParams()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalTarget, setApprovalTarget] = useState<Application | null>(null)
  const [approvalPhase, setApprovalPhase] = useState<ApprovalPhase>("confirm")
  const [approvalEvents, setApprovalEvents] = useState<ApplicationApprovalSseEvent[]>([])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [quotaTarget, setQuotaTarget] = useState<Application | null>(null)
  const [quotaGiB, setQuotaGiB] = useState("100")
  const [savingQuota, setSavingQuota] = useState(false)
  const [expansionTarget, setExpansionTarget] = useState<Application | null>(null)
  const [expansionReason, setExpansionReason] = useState("")
  const [expansionGiB, setExpansionGiB] = useState("10")
  const [submittingExpansion, setSubmittingExpansion] = useState(false)
  const [expansionRequests, setExpansionRequests] = useState<ExpansionRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [quotaRule, setQuotaRule] = useState<QuotaAlertRule | null>(null)
  const [ruleForm, setRuleForm] = useState({ low_percent: 70, medium_percent: 85, high_percent: 90, block_percent: 100, message_template: "" })
  const [savingRule, setSavingRule] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false)

  const [createForm, setCreateForm] = useState<ApplicationCreateRequest>({
    name: "",
    shown_name: "",
    description: "",
  })
  const [creating, setCreating] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const isStreaming = approvalPhase === "streaming"
  const streamLocksUi = approvalTarget !== null && isStreaming

  const loadApplications = async () => {
    setLoading(true)
    try {
      const resp = await fetchApplicationsApi(accessToken ?? undefined)
      setApplications(resp.data)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setLoading(false)
    }
  }

  const loadExpansionRequests = async () => {
    setLoadingRequests(true)
    try {
      const response = await fetchExpansionRequestsApi(accessToken ?? undefined)
      setExpansionRequests(response.data)
    } catch {
      // 错误由 API 客户端统一提示。
    } finally {
      setLoadingRequests(false)
    }
  }

  const loadQuotaRule = async () => {
    try {
      const rule = await fetchQuotaAlertRuleApi(accessToken ?? undefined)
      setQuotaRule(rule)
      setRuleForm({
        low_percent: rule.low_percent,
        medium_percent: rule.medium_percent,
        high_percent: rule.high_percent,
        block_percent: rule.block_percent,
        message_template: rule.message_template,
      })
    } catch {
      // 错误由 API 客户端统一提示。
    }
  }

  useEffect(() => {
    void loadApplications()
    void loadExpansionRequests()
    if (canApprove) void loadQuotaRule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApprove])

  useEffect(() => {
    const targetId = searchParams.get("expand")
    if (!targetId || expansionTarget || applications.length === 0) return
    const target = applications.find((application) => application.id === targetId)
    if (!target || target.author?.username !== user?.username) return
    setExpansionTarget(target)
    setExpansionReason("")
    setExpansionGiB("10")
    setSearchParams({}, { replace: true })
  }, [applications, expansionTarget, searchParams, setSearchParams, user?.username])

  useEffect(() => {
    if (!isStreaming) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isStreaming])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [approvalEvents])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      endBlock()
    }
  }, [endBlock])

  const resetApprovalModal = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setApprovalTarget(null)
    setApprovalPhase("confirm")
    setApprovalEvents([])
    endBlock()
  }, [endBlock])

  const openCreateModal = () => {
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!createForm.shown_name.trim()) {
      showErrorToast("请填写显示名称")
      return
    }

    if (!createForm.name.trim()) {
      showErrorToast("请填写 APPID")
      return
    }

    if (!createForm.description.trim()) {
      showErrorToast("请填写应用描述")
      return
    }

    setCreating(true)
    try {
      await createApplicationApi(createForm, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({
        name: "",
        shown_name: "",
        description: "",
      })
      void loadApplications()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setCreating(false)
    }
  }

  const openQuota = (app: Application) => {
    setQuotaTarget(app)
    setQuotaGiB(String(Math.max(1, Math.round(app.quota_bytes / GIB))))
  }

  const openExpansion = (app: Application) => {
    setExpansionTarget(app)
    setExpansionReason("")
    setExpansionGiB("10")
  }

  const handleExpansionSubmit = async () => {
    if (!expansionTarget) return
    const addGiB = Number(expansionGiB)
    if (!expansionReason.trim()) {
      showErrorToast("请填写扩容原因")
      return
    }
    if (!Number.isInteger(addGiB) || addGiB <= 0 || !Number.isSafeInteger(addGiB * GIB)) {
      showErrorToast("增加配额必须是大于 0 的整数 GiB")
      return
    }
    setSubmittingExpansion(true)
    try {
      await createExpansionRequestApi(expansionTarget.id, { reason: expansionReason.trim(), add_size_bytes: addGiB * GIB }, accessToken ?? undefined)
      setExpansionTarget(null)
      setExpansionReason("")
      await loadExpansionRequests()
      showSuccessToast("扩容申请已提交")
    } catch {
      // 错误由 API 客户端统一提示。
    } finally {
      setSubmittingExpansion(false)
    }
  }

  const handleRuleSave = async () => {
    if (!ruleForm.message_template.trim()) {
      showErrorToast("请填写告警内容模板")
      return
    }
    if (!(ruleForm.low_percent < ruleForm.medium_percent && ruleForm.medium_percent < ruleForm.high_percent && ruleForm.high_percent < ruleForm.block_percent)) {
      showErrorToast("阈值必须按低、中、高、阻断严格递增")
      return
    }
    setSavingRule(true)
    try {
      const updated = await updateQuotaAlertRuleApi(ruleForm, accessToken ?? undefined)
      setQuotaRule(updated)
      showSuccessToast("全局配额告警规则已保存")
    } catch {
      // 错误由 API 客户端统一提示。
    } finally {
      setSavingRule(false)
    }
  }

  const handleExpansionReview = async (request: ExpansionRequest, approved: boolean) => {
    try {
      await reviewExpansionRequestApi(request.id, { approved, review_note: "" }, accessToken ?? undefined)
      await Promise.all([loadExpansionRequests(), loadApplications()])
      showSuccessToast(approved ? "扩容申请已同意" : "扩容申请已拒绝")
    } catch {
      // 错误由 API 客户端统一提示。
    }
  }

  const handleQuotaSave = async () => {
    if (!quotaTarget) return
    const value = Number(quotaGiB)
    if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
      showErrorToast("配额必须是大于等于 1 的整数 GiB")
      return
    }
    const quotaBytes = value * GIB
    if (!Number.isSafeInteger(quotaBytes)) {
      showErrorToast("配额数值过大")
      return
    }
    if (quotaBytes < quotaTarget.quota_usage_bytes) {
      showErrorToast("新配额不能低于当前已用空间")
      return
    }
    setSavingQuota(true)
    try {
      const updated = await updateApplicationQuotaApi(
        quotaTarget.id,
        { quota_bytes: quotaBytes },
        accessToken ?? undefined,
      )
      setApplications((previous) => previous.map((app) => app.id === updated.id ? updated : app))
      setQuotaTarget(null)
      showSuccessToast(`已将 ${quotaTarget.shown_name || quotaTarget.name} 的配额调整为 ${value} GiB`)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setSavingQuota(false)
    }
  }

  const openApproval = (app: Application) => {
    setApprovalTarget(app)
    setApprovalPhase("confirm")
    setApprovalEvents([])
  }

  const handleApprove = async () => {
    if (!approvalTarget || isStreaming) return

    const ac = new AbortController()
    abortRef.current = ac
    const finalSseEventCapture = { current: null as ApplicationApprovalSseEvent | null }
    setApprovalPhase("streaming")
    setApprovalEvents([])
    beginBlock("授权流程进行中，确定要离开当前页面吗？离开将中断与服务器的授权连接。")

    try {
      await approveApplicationStream({
        applicationId: approvalTarget.id,
        accessToken: accessToken ?? undefined,
        signal: ac.signal,
        onEvent: (ev: ApplicationApprovalSseEvent) => {
          finalSseEventCapture.current = ev
          setApprovalEvents((prev) => [...prev, ev])
        },
      })

      await loadApplications()

      const finalSseEvent: ApplicationApprovalSseEvent | null = finalSseEventCapture.current
      if (finalSseEvent?.step === "done" && finalSseEvent.status === "success") {
        showSuccessToast(finalSseEvent.message || "授权成功")
      } else if (finalSseEvent?.status === "failed") {
        showErrorToast(finalSseEvent.message || "授权失败")
      } else if (
        finalSseEvent
        && finalSseEvent.status !== "ok"
        && finalSseEvent.status !== "success"
      ) {
        showErrorToast("授权流已结束，但未收到明确完成状态，请刷新列表确认。")
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError")
        || (e instanceof Error && e.name === "AbortError")
      if (!aborted) {
        await loadApplications().catch(() => {})
      }
    } finally {
      endBlock()
      setApprovalPhase("finished")
      abortRef.current = null
    }
  }

  const approvalModalTitle =
    approvalPhase === "confirm" ? "确认授权应用" : "应用授权进度"

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">应用管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理业务应用与授权状态。
          </p>
        </div>
        <div className="sticky top-3 flex items-center gap-2">
          {canApprove ? (
            <Button type="button" size="icon" variant="outline" title="配置全局配额告警规则" aria-label="配置全局配额告警规则" onClick={() => setShowRuleModal(true)}>
              <BellRing className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          <Button type="button" size="md" onClick={openCreateModal}>
            新建应用
          </Button>
        </div>
      </div>

      {loading ? (
        <BrandLoading label="正在加载应用列表..." />
      ) : applications.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">暂无应用数据</div>
            <div className="text-xs text-muted-foreground">
              点击右上角「新建应用」按钮，创建第一个应用。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {applications.map((app) => (
            <Card key={app.id} className="flex flex-col">
              <CardContent className="pt-4 text-[11px] text-muted-foreground">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                        {(app.shown_name || app.name).charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {app.shown_name || app.name}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      APPID：{app.name}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {app.description}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex max-w-[160px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {app.id}
                    </span>
                    <span
                      className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    >
                      {app.enabled ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          已授权
                        </span>
                      ) : canApprove ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={streamLocksUi}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => openApproval(app)}
                        >
                          授权
                        </Button>
                      ) : (
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          待管理员授权
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-3 border-t border-dashed border-border/70 pt-3 md:grid-cols-2">
                  <div>
                    <div className="text-muted-foreground/70">创建人</div>
                    <div className="mt-0.5 text-xs text-foreground/80">
                      {app.author?.name || app.author?.username}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">创建时间</div>
                    <div className="mt-0.5 text-xs text-foreground/80">
                      {formatDateTime(app.created_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">授权状态</div>
                    <div className="mt-0.5 text-xs text-foreground/80">
                      {app.enabled ? "已授权" : "未授权"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">授权时间</div>
                    <div className="mt-0.5 text-xs text-foreground/80">
                      {formatDateTime(app.enabled_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t border-dashed border-border/70 pt-3">
                  {(() => {
                    const percent = quotaPercent(app)
                    return (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/90">
                            <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            存储配额
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {formatBytes(app.quota_usage_bytes)} / {formatBytes(app.quota_bytes)}
                            </span>
                            {app.author?.username === user?.username ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="申请扩容"
                                aria-label={`为 ${app.shown_name || app.name} 申请扩容`}
                                onClick={() => openExpansion(app)}
                              >
                                <Expand className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            ) : null}
                            {canManageQuota ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="调整存储配额"
                                aria-label={`调整 ${app.shown_name || app.name} 的存储配额`}
                                onClick={() => openQuota(app)}
                              >
                                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Progress
                          value={percent}
                          indicatorClassName={quotaColor(percent)}
                          className="mt-2 h-2"
                          aria-label={`${app.shown_name || app.name} 存储配额使用率`}
                        />
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{percent.toFixed(1)}%</span>
                          <span>{app.quota_usage_updated_at ? `更新于 ${formatDateTime(app.quota_usage_updated_at)}` : "等待用量采集"}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {expansionRequests.length > 0 ? (
        <Card className="mt-4 rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">扩容申请</h2>{loadingRequests ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="正在加载" /> : null}</div><div className="mt-3 space-y-2">{expansionRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2.5 text-xs"><div className="min-w-0"><div className="font-medium">{request.application_shown_name} · 增加 {formatBytes(request.add_size_bytes)}</div><div className="mt-1 text-muted-foreground">{request.reason} · {formatDateTime(request.created_at)}</div></div><div className="flex items-center gap-2"><span className={cn("rounded-full px-2 py-1 text-[11px]", request.status === "pending" ? "bg-amber-500/10 text-amber-700" : request.status === "approved" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground")}>{request.status === "pending" ? "待审批" : request.status === "approved" ? "已同意" : "已拒绝"}</span>{canApprove && request.status === "pending" ? <><Button type="button" size="sm" className="h-7" onClick={() => void handleExpansionReview(request, true)}>同意</Button><Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void handleExpansionReview(request, false)}>拒绝</Button></> : null}</div></div>)}</div></CardContent></Card>
      ) : null}

      {canApprove && showRuleModal ? (
        <Modal title="全局配额告警规则" onClose={() => !savingRule && setShowRuleModal(false)}>
          <div className="space-y-4 p-1 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs leading-relaxed text-muted-foreground">上传前按预计用量触发告警，达到阻断阈值时拒绝上传。阈值默认是低 70%、中 85%、高 90%、阻断 100%。</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">{quotaRule ? `更新人：${quotaRule.updated_by || "系统默认"}` : ""}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([
              ["low_percent", "低"], ["medium_percent", "中"], ["high_percent", "高"], ["block_percent", "阻断"],
            ] as const).map(([key, label]) => <div key={key}><Label className="mb-1 block text-xs">{label}阈值（%）</Label><Input type="number" min={1} max={100} value={ruleForm[key]} onChange={(event) => setRuleForm((previous) => ({ ...previous, [key]: Number(event.target.value) }))} /></div>)}</div>
            <div><Label className="mb-1 block text-xs" htmlFor="quota-alert-template">告警内容模板</Label><textarea id="quota-alert-template" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={ruleForm.message_template} onChange={(event) => setRuleForm((previous) => ({ ...previous, message_template: event.target.value }))} /></div>
            <DialogFooter><Button type="button" size="sm" variant="outline" disabled={savingRule} onClick={() => setShowRuleModal(false)}>取消</Button><Button type="button" size="sm" disabled={savingRule} onClick={() => void handleRuleSave()}>{savingRule ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}保存规则</Button></DialogFooter>
          </div>
        </Modal>
      ) : null}

      {showCreateModal && (
        <Modal title="新建应用" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 p-1 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs" htmlFor="app-shown_name">
                  显示名称
                </Label>
                <Input
                  id="app-shown_name"
                  type="text"
                  value={createForm.shown_name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      shown_name: e.target.value,
                    }))
                  }
                  placeholder="例如：部件信息管理系统"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs" htmlFor="app-name">
                  APPID
                </Label>
                <Input
                  id="app-name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="例如：cpl"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="mb-1 block text-xs" htmlFor="app-desc">
                  应用描述
                </Label>
                <Input
                  id="app-desc"
                  type="text"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="例如：CPL 的生产环境后端服务器"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                {creating ? 
                <span className="flex items-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-100/70 border-t-emerald-600" />
                    <span>创建中</span>
                  </span>
                : "确认创建"}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}
      {canManageQuota && quotaTarget ? (
        <Modal title="调整存储配额" onClose={() => !savingQuota && setQuotaTarget(null)}>
          <div className="space-y-4 p-1 text-sm">
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{quotaTarget.shown_name || quotaTarget.name}</div>
              <div className="mt-1">当前用量 {formatBytes(quotaTarget.quota_usage_bytes)}，新配额不能低于已用空间。</div>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs" htmlFor="application-quota-gib">
                配额（GiB）
              </Label>
              <Input
                id="application-quota-gib"
                type="number"
                min={1}
                step={1}
                value={quotaGiB}
                disabled={savingQuota}
                onChange={(event) => setQuotaGiB(event.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                保存后会同步设置所有 MinIO 站点的桶硬配额；默认值为 100 GiB。
              </p>
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" disabled={savingQuota} onClick={() => setQuotaTarget(null)}>
                取消
              </Button>
              <Button type="button" size="sm" disabled={savingQuota} onClick={() => void handleQuotaSave()}>
                {savingQuota ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                保存配额
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}
      {expansionTarget ? (
        <Modal title="应用配置扩容申请" onClose={() => !submittingExpansion && setExpansionTarget(null)}>
          <div className="space-y-4 p-1 text-sm">
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><div className="font-medium text-foreground">{expansionTarget.shown_name || expansionTarget.name}</div><div className="mt-1">当前配额 {formatBytes(expansionTarget.quota_bytes)}，申请会提交给应用管理员审批。</div></div>
            <div><Label className="mb-1.5 block text-xs" htmlFor="expansion-size">增加配额（GiB）</Label><Input id="expansion-size" type="number" min={1} step={1} value={expansionGiB} disabled={submittingExpansion} onChange={(event) => setExpansionGiB(event.target.value)} /></div>
            <div><Label className="mb-1.5 block text-xs" htmlFor="expansion-reason">申请原因</Label><textarea id="expansion-reason" className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" value={expansionReason} disabled={submittingExpansion} onChange={(event) => setExpansionReason(event.target.value)} placeholder="说明业务增长或容量使用情况" /></div>
            <DialogFooter><Button type="button" size="sm" variant="outline" disabled={submittingExpansion} onClick={() => setExpansionTarget(null)}>取消</Button><Button type="button" size="sm" disabled={submittingExpansion} onClick={() => void handleExpansionSubmit()}>{submittingExpansion ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}提交申请</Button></DialogFooter>
          </div>
        </Modal>
      ) : null}
      {canApprove && approvalTarget && (
        <Modal
          title={approvalModalTitle}
          onClose={() => {
            if (isStreaming) return
            resetApprovalModal()
          }}
          disableClose={isStreaming}
          contentClassName={
            approvalPhase === "confirm"
              ? undefined
              : "flex h-[min(88vh,calc(100dvh-2.5rem))] flex-col overflow-hidden"
          }
          bodyClassName={
            approvalPhase === "confirm"
              ? undefined
              : "flex min-h-0 flex-1 flex-col overflow-hidden !max-h-none py-0"
          }
        >
          <div
            className={cn(
              "text-sm",
              approvalPhase === "confirm"
                ? "space-y-4"
                : "flex min-h-0 flex-1 flex-col gap-4",
            )}
          >
            {approvalPhase === "confirm" ? (
              <>
                <p className="text-[13px] text-muted-foreground">
                  确认要为以下应用执行授权操作？
                </p>
                <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                  <div>
                    <div className="text-muted-foreground/70">显示名称</div>
                    <div className="mt-0.5 text-foreground/90">
                      {approvalTarget.shown_name || approvalTarget.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">APPID</div>
                    <div className="mt-0.5 text-foreground/90">
                      {approvalTarget.name}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">创建人</div>
                    <div className="mt-0.5 text-foreground/90">
                      {approvalTarget.author?.name || approvalTarget.author?.username}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">创建时间</div>
                    <div className="mt-0.5 text-foreground/90">
                      {formatDateTime(approvalTarget.created_at)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="shrink-0 text-[12px] text-muted-foreground">
                  {isStreaming
                    ? "正在与服务器建立授权流，请保持页面打开直至完成。"
                    : "授权流程已结束，可关闭此窗口返回列表。"}
                </p>
                <div className="docs-scroll min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px]">
                  {approvalEvents.length === 0 && isStreaming ? (
                    <div className="flex items-center gap-2 py-6 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>等待服务器返回进度…</span>
                    </div>
                  ) : (
                    approvalEvents.map((ev, i) => {
                      const isActiveRunning =
                        ev.status === "running" && i === approvalEvents.length - 1
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-2 rounded-md border-l-2 py-1.5 pl-2 pr-1",
                            statusStyle(ev.status),
                          )}
                        >
                          <StatusGlyph status={ev.status} isRunningActive={isActiveRunning} />
                          <div className="min-w-0 flex-1 leading-snug">
                            <div className="font-medium text-foreground/90">{ev.message}</div>
                            {(ev.server_name || ev.step) && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {approvalStepLabel(ev.step)}
                                {ev.server_name ? ` · ${ev.server_name}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={logEndRef} />
                </div>
              </>
            )}

            <DialogFooter className={approvalPhase === "confirm" ? undefined : "shrink-0"}>
              {approvalPhase === "confirm" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isStreaming}
                    onClick={() => {
                      if (isStreaming) return
                      resetApprovalModal()
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isStreaming}
                    onClick={() => void handleApprove()}
                  >
                    确认授权
                  </Button>
                </>
              ) : approvalPhase === "streaming" ? (
                <p className="w-full text-right text-[11px] text-muted-foreground">
                  流式连接进行中，关闭不可用
                </p>
              ) : (
                <Button type="button" size="sm" onClick={() => resetApprovalModal()}>
                  关闭
                </Button>
              )}
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  )
}
