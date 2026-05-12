import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Circle, Loader2, XCircle } from "lucide-react"
import { useAuth } from "../../auth/AuthContext"
import {
  approveApplicationStream,
  createApplicationApi,
  fetchApplicationsApi,
} from "../../api/client"
import type {
  Application,
  ApplicationApprovalSseEvent,
  ApplicationApprovalSseStatus,
  ApplicationCreateRequest,
} from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { useNavigationLeaveBlock } from "../../contexts/NavigationLeaveBlockContext"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { cn } from "../../lib/utils"

type ApprovalPhase = "confirm" | "streaming" | "finished"

function statusStyle(status: ApplicationApprovalSseStatus): string {
  if (status === "running") {
    return "border-l-amber-500 bg-amber-500/5 text-foreground"
  }
  if (status === "ok" || status === "success") {
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
  if (status === "ok" || status === "success") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
  }
  if (status === "failed") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
  }
  return null
}

export default function ApplicationPage() {
  const { accessToken } = useAuth()
  const { beginBlock, endBlock } = useNavigationLeaveBlock()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalTarget, setApprovalTarget] = useState<Application | null>(null)
  const [approvalPhase, setApprovalPhase] = useState<ApprovalPhase>("confirm")
  const [approvalEvents, setApprovalEvents] = useState<ApplicationApprovalSseEvent[]>([])

  const [showCreateModal, setShowCreateModal] = useState(false)

  const [createForm, setCreateForm] = useState<ApplicationCreateRequest>({
    name: "",
    shown_name: "",
    description: "",
    regions: [],
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

  useEffect(() => {
    void loadApplications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        regions: [],
      })
      void loadApplications()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setCreating(false)
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
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">应用管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理业务应用与授权状态。
          </p>
        </div>
        <div className="sticky top-3">
          <Button type="button" size="md" onClick={openCreateModal}>
            新建应用
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-primary" />
            <div>正在加载应用列表...</div>
          </div>
        </div>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      ) : (
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
                      {app.created_at.replace("T", " ")}
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
                      {app.enabled_at ? app.enabled_at.replace("T", " ") : "-"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
      {approvalTarget && (
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
                      {approvalTarget.created_at.replace("T", " ")}
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
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px]">
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
                                {ev.step}
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
