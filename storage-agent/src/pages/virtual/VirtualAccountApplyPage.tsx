import { useCallback, useEffect, useState } from "react"
import { useAuth, useReloadOnBackendChange } from "../../auth/AuthContext"
import {
  advanceAccountApplication,
  approveAccountApplication,
  createAccountApplication,
  deliverAccountSecret,
  listAccountApplications,
  rejectAccountApplication,
  retryAccountInit,
  rotateAccountSecret,
  withdrawAccountApplication,
  VirtualStorageApiError,
  type AccountApplication,
} from "../../api/virtualStorage"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { BrandLoading } from "../../components/BrandLoading"
import { ListErrorState } from "../../components/ListErrorState"
import { Modal } from "../../components/Modal"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { useDocumentTitle } from "../../lib/useDocumentTitle"

const STATUS_LABEL: Record<string, string> = {
  submitted: "待审核",
  withdrawn: "已撤回",
  rejected: "已拒绝",
  approved: "已批准",
}

const INIT_LABEL: Record<string, string> = {
  pending: "等待初始化",
  initializing: "初始化中",
  active: "已生效",
  failed: "初始化失败",
}

function messageOf(error: unknown) {
  return error instanceof VirtualStorageApiError ? error.message : "请求失败"
}

function StatusPill({ active, label }: { active?: boolean; label: string }) {
  const tone = active
    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
    : "border-border bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}>
      {label}
    </span>
  )
}

export default function VirtualAccountApplyPage() {
  const { accessToken: token, user } = useAuth()
  const canReview = hasPermission(user, PERMISSIONS.virtualAccountReview)
  const [queue, setQueue] = useState(false)
  const [rows, setRows] = useState<AccountApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [publicId, setPublicId] = useState("")
  const [purpose, setPurpose] = useState("")
  const [quotaBytes, setQuotaBytes] = useState("1073741824")
  const [quotaObjects, setQuotaObjects] = useState("10000")
  const [submitting, setSubmitting] = useState(false)
  const [secret, setSecret] = useState("")
  const [rejectTarget, setRejectTarget] = useState<AccountApplication | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [withdrawTarget, setWithdrawTarget] = useState<AccountApplication | null>(null)
  const [approveTarget, setApproveTarget] = useState<AccountApplication | null>(null)
  const [rotateTarget, setRotateTarget] = useState<AccountApplication | null>(null)
  const [busyId, setBusyId] = useState("")
  const [accountRevision, setAccountRevision] = useState<Record<string, number>>({})
  useDocumentTitle("虚拟账号申请")

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(false)
    try {
      const page = await listAccountApplications(token, !queue || !canReview)
      setRows(page.items)
    } catch (caught) {
      setLoadError(true)
      showErrorToast(messageOf(caught))
    } finally {
      setLoading(false)
    }
  }, [token, queue, canReview])

  useEffect(() => { void load() }, [load])
  useReloadOnBackendChange(load)

  async function submitApplication() {
    if (!token || submitting) return
    const normalized = publicId.trim().toLowerCase()
    if (!/^[a-z0-9-]{4,32}$/.test(normalized)) {
      showErrorToast("account id 需要 4 到 32 位小写字母、数字或连字符")
      return
    }
    setSubmitting(true)
    try {
      await createAccountApplication(token, {
        public_account_id: normalized,
        purpose,
        requested_quota_bytes: Number(quotaBytes),
        requested_quota_objects: Number(quotaObjects),
        idempotency_key: crypto.randomUUID(),
      })
      showSuccessToast("申请已提交")
      setApplyOpen(false)
      setPublicId("")
      setPurpose("")
      await load()
    } catch (caught) {
      showErrorToast(messageOf(caught))
    } finally {
      setSubmitting(false)
    }
  }

  async function showSecret(value: string) {
    setSecret(value)
  }

  async function runRowAction(id: string, work: () => Promise<void>, success: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await work()
      showSuccessToast(success)
      await load()
    } catch (caught) {
      showErrorToast(messageOf(caught))
    } finally {
      setBusyId("")
    }
  }

  return (
    <div className="mx-auto max-w-8xl" data-testid="virtual-account-apply-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">虚拟账号申请</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            这是机器账号，不能当作 Stor 用户登录。
            {canReview ? " 审核人可以切换到待审核队列。" : ""}
          </p>
        </div>
        <div className="sticky top-3 flex items-center gap-2">
          {canReview ? (
            <Button type="button" size="sm" variant={queue ? "default" : "outline"} onClick={() => setQueue((value) => !value)}>
              {queue ? "查看我的申请" : "查看待审核"}
            </Button>
          ) : null}
          <Button type="button" size="md" onClick={() => setApplyOpen(true)}>
            申请虚拟账号
          </Button>
        </div>
      </div>

      {loading ? (
        <BrandLoading label="正在读取申请" />
      ) : loadError ? (
        <ListErrorState message="申请列表加载失败" onRetry={() => void load()} retrying={loading} />
      ) : rows.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">没有申请</div>
            <div className="text-xs text-muted-foreground">
              {queue ? "当前没有待审核的申请。" : "点击右上角「申请虚拟账号」提交第一张申请。"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((item) => {
            const busy = busyId === item.application_id
            return (
              <Card key={item.application_id} className="flex flex-col">
                <CardContent className="pt-4 text-[11px] text-muted-foreground">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground/70">account id</div>
                      <div className="mt-1 break-all font-mono text-sm text-foreground">{item.public_account_id}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <StatusPill active={item.status === "approved"} label={STATUS_LABEL[item.status] || item.status} />
                        {item.init_status ? (
                          <StatusPill active={item.init_status === "active"} label={INIT_LABEL[item.init_status] || item.init_status} />
                        ) : null}
                      </div>
                    </div>
                    <span className="inline-flex max-w-[180px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {item.application_id}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 border-t border-dashed border-border/70 pt-2 sm:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground/70">用途</div>
                      <div className="mt-0.5 break-words text-xs text-foreground/80">{item.purpose || "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground/70">期望配额</div>
                      <div className="mt-0.5 text-xs text-foreground/80">{item.requested_quota_bytes} / {item.requested_quota_objects}</div>
                    </div>
                    {item.reject_reason ? (
                      <div className="sm:col-span-2">
                        <div className="text-muted-foreground/70">说明</div>
                        <div className="mt-0.5 text-xs text-foreground/80">{item.reject_reason}</div>
                      </div>
                    ) : null}
                    {item.init_error ? (
                      <div className="sm:col-span-2">
                        <div className="text-muted-foreground/70">初始化错误</div>
                        <div className="mt-0.5 text-xs text-destructive">{item.init_error}</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-dashed border-border/70 pt-3">
                    {item.status === "submitted" && !queue ? (
                      <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setWithdrawTarget(item)}>撤回</Button>
                    ) : null}
                    {queue && item.status === "submitted" ? (
                      <>
                        <Button type="button" size="sm" className="h-7" disabled={busy} onClick={() => setApproveTarget(item)}>批准</Button>
                        <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => { setRejectTarget(item); setRejectReason("") }}>拒绝</Button>
                      </>
                    ) : null}
                    {item.status === "approved" && item.init_status !== "active" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={busy}
                        onClick={() => void runRowAction(
                          item.application_id,
                          () => (item.init_status === "failed"
                            ? retryAccountInit(token || "", item.application_id)
                            : advanceAccountApplication(token || "", item.application_id)
                          ).then(() => undefined),
                          item.init_status === "failed" ? "已重新开始初始化" : "已继续初始化",
                        )}
                      >
                        {item.init_status === "failed" ? "重试初始化" : "继续初始化"}
                      </Button>
                    ) : null}
                    {item.init_status === "active" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={busy}
                          onClick={() => void runRowAction(
                            item.application_id,
                            async () => {
                              const result = await deliverAccountSecret(token || "", item.public_account_id)
                              await showSecret(result.client_secret)
                            },
                            "密钥已准备好，只显示这一次",
                          )}
                        >
                          领取密钥
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setRotateTarget(item)}>
                          重新生成密钥
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {applyOpen ? (
        <Modal title="申请虚拟账号" onClose={() => { if (!submitting) setApplyOpen(false) }} disableClose={submitting}>
          <div className="space-y-4 p-1 text-sm">
            <div>
              <Label htmlFor="public-account-id">account id</Label>
              <Input id="public-account-id" value={publicId} onChange={(event) => setPublicId(event.target.value)} placeholder="4 到 32 位小写字母、数字或连字符" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="purpose">用途</Label>
              <Input id="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="quota-bytes">期望字节配额</Label>
                <Input id="quota-bytes" value={quotaBytes} onChange={(event) => setQuotaBytes(event.target.value)} inputMode="numeric" />
              </div>
              <div>
                <Label htmlFor="quota-objects">期望对象配额</Label>
                <Input id="quota-objects" value={quotaObjects} onChange={(event) => setQuotaObjects(event.target.value)} inputMode="numeric" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">这里不创建登录用户。密钥由系统在审核通过并初始化完成后生成，并且只展示一次。</p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => setApplyOpen(false)}>取消</Button>
              <Button type="button" size="sm" disabled={submitting} onClick={() => void submitApplication()}>
                {submitting ? "提交中" : "提交申请"}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}

      {withdrawTarget ? (
        <Modal title="确认撤回申请" onClose={() => setWithdrawTarget(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">撤回后 account id「{withdrawTarget.public_account_id}」会立即释放。</p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setWithdrawTarget(null)}>取消</Button>
              <Button type="button" size="sm" onClick={() => {
                const target = withdrawTarget
                setWithdrawTarget(null)
                void runRowAction(target.application_id, () => withdrawAccountApplication(token || "", target).then(() => undefined), "申请已撤回")
              }}>确认撤回</Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}

      {approveTarget ? (
        <Modal title="确认批准申请" onClose={() => setApproveTarget(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">
              批准「{approveTarget.public_account_id}」，配额 {approveTarget.requested_quota_bytes} 字节 / {approveTarget.requested_quota_objects} 个对象。
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setApproveTarget(null)}>取消</Button>
              <Button type="button" size="sm" onClick={() => {
                const target = approveTarget
                setApproveTarget(null)
                void runRowAction(
                  target.application_id,
                  () => approveAccountApplication(token || "", target, target.requested_quota_bytes, target.requested_quota_objects).then(() => undefined),
                  "申请已批准",
                )
              }}>确认批准</Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}

      {rejectTarget ? (
        <Modal title="拒绝申请" onClose={() => { if (!rejecting) setRejectTarget(null) }} disableClose={rejecting}>
          <div className="space-y-4 text-sm">
            <div>
              <Label htmlFor="reject-reason">原因</Label>
              <Input id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" disabled={rejecting} onClick={() => setRejectTarget(null)}>取消</Button>
              <Button type="button" size="sm" disabled={rejecting || !token} onClick={() => {
                if (!token || !rejectTarget) return
                const target = rejectTarget
                setRejecting(true)
                void rejectAccountApplication(token, target, rejectReason).then(async () => {
                  setRejectTarget(null)
                  showSuccessToast("申请已拒绝")
                  await load()
                }).catch((caught) => showErrorToast(messageOf(caught))).finally(() => setRejecting(false))
              }}>{rejecting ? "提交中" : "确认拒绝"}</Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}

      {rotateTarget ? (
        <Modal title="确认重新生成密钥" onClose={() => setRotateTarget(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">重新生成后，旧密钥和已发出的 token 会立即失效。新密钥只显示一次。</p>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setRotateTarget(null)}>取消</Button>
              <Button type="button" size="sm" onClick={() => {
                const target = rotateTarget
                setRotateTarget(null)
                const revision = accountRevision[target.public_account_id] ?? 0
                void runRowAction(target.application_id, async () => {
                  const result = await rotateAccountSecret(token || "", target.public_account_id, revision)
                  setAccountRevision((current) => ({ ...current, [target.public_account_id]: result.revision }))
                  await showSecret(result.client_secret)
                }, "新密钥已生成")
              }}>确认重新生成</Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}

      {secret ? (
        <Modal title="client_secret 只显示这一次" onClose={() => setSecret("")}>
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">
              请妥善保存以下密钥，<span className="text-red-500">该值只会展示一次</span>。它用来换取有时效的 token，不能用来登录 Stor。
            </p>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-[11px] text-muted-foreground/70">client_secret</div>
              <p className="mt-1 break-all font-mono text-sm text-foreground" data-testid="client-secret-once">{secret}</p>
            </div>
            <DialogFooter>
              <Button type="button" size="sm" onClick={() => setSecret("")}>我已保存</Button>
            </DialogFooter>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
