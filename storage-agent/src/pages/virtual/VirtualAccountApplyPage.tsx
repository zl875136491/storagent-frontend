import { useCallback, useEffect, useState } from "react"
import { Database, Loader2, Plus, ShieldAlert } from "lucide-react"
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
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
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

export default function VirtualAccountApplyPage() {
  const { accessToken: token, user } = useAuth()
  const canReview = hasPermission(user, PERMISSIONS.virtualAccountReview)
  const [queue, setQueue] = useState(false)
  const [rows, setRows] = useState<AccountApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [applyOpen, setApplyOpen] = useState(false)
  const [publicId, setPublicId] = useState("")
  const [purpose, setPurpose] = useState("")
  const [quotaBytes, setQuotaBytes] = useState("1073741824")
  const [quotaObjects, setQuotaObjects] = useState("10000")
  const [secret, setSecret] = useState("")
  const [secretOpen, setSecretOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<AccountApplication | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [accountRevision, setAccountRevision] = useState<Record<string, number>>({})
  useDocumentTitle("虚拟账号申请")

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError("")
    try {
      const page = await listAccountApplications(token, !queue || !canReview)
      setRows(page.items)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setLoading(false)
    }
  }, [token, queue, canReview])

  useEffect(() => { void load() }, [load])

  async function submitApplication() {
    if (!token) return
    setError("")
    try {
      await createAccountApplication(token, {
        public_account_id: publicId.trim().toLowerCase(),
        purpose,
        requested_quota_bytes: Number(quotaBytes),
        requested_quota_objects: Number(quotaObjects),
        idempotency_key: crypto.randomUUID(),
      })
      setApplyOpen(false)
      setPublicId("")
      setPurpose("")
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  async function showSecret(value: string) {
    setSecret(value)
    setSecretOpen(true)
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col text-foreground" data-testid="virtual-account-apply-page">
      {error ? <div className="mb-2 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-background/70 px-3 py-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Database className="h-3.5 w-3.5 text-primary" aria-hidden />
            虚拟账号申请
          </span>
          <span className="text-muted-foreground">这是机器账号，不能当作 Stor 用户登录。</span>
          <div className="ml-auto flex items-center gap-1">
            {canReview ? (
              <Button type="button" size="sm" variant={queue ? "default" : "outline"} className="h-7" onClick={() => setQueue((value) => !value)}>
                {queue ? "查看我的申请" : "查看待审核"}
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-7" onClick={() => setApplyOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              申请虚拟账号
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-background/20">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取申请
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>account id</TableHead>
                  <TableHead>申请状态</TableHead>
                  <TableHead>初始化</TableHead>
                  <TableHead>用途</TableHead>
                  <TableHead>期望配额</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">没有申请</TableCell></TableRow>
                ) : rows.map((item) => (
                  <TableRow key={item.application_id}>
                    <TableCell className="font-mono text-xs">{item.public_account_id}</TableCell>
                    <TableCell>{STATUS_LABEL[item.status] || item.status}</TableCell>
                    <TableCell>{INIT_LABEL[item.init_status] || "—"}{item.reject_reason ? ` · ${item.reject_reason}` : ""}</TableCell>
                    <TableCell className="max-w-64 truncate">{item.purpose || "—"}</TableCell>
                    <TableCell className="text-xs">{item.requested_quota_bytes} / {item.requested_quota_objects}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      {item.status === "submitted" && !queue ? (
                        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => token && withdrawAccountApplication(token, item).then(load).catch((caught) => setError(messageOf(caught)))}>撤回</Button>
                      ) : null}
                      {queue && item.status === "submitted" ? (
                        <>
                          <Button type="button" size="sm" className="h-7" onClick={() => token && approveAccountApplication(token, item, item.requested_quota_bytes, item.requested_quota_objects).then(load).catch((caught) => setError(messageOf(caught)))}>批准</Button>
                          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => { setRejectTarget(item); setRejectReason("") }}>拒绝</Button>
                        </>
                      ) : null}
                      {item.status === "approved" && item.init_status !== "active" ? (
                        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => token && (item.init_status === "failed" ? retryAccountInit(token, item.application_id) : advanceAccountApplication(token, item.application_id)).then(load).catch((caught) => setError(messageOf(caught)))}>
                          {item.init_status === "failed" ? "重试初始化" : "继续初始化"}
                        </Button>
                      ) : null}
                      {item.init_status === "active" ? (
                        <>
                          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => token && deliverAccountSecret(token, item.public_account_id).then((result) => showSecret(result.client_secret)).catch((caught) => setError(messageOf(caught)))}>领取密钥</Button>
                          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => {
                            if (!token || !window.confirm("重新生成后，旧密钥和已发出的 token 会立即失效。")) return
                            const revision = accountRevision[item.public_account_id] ?? 0
                            void rotateAccountSecret(token, item.public_account_id, revision).then((result) => {
                              setAccountRevision((current) => ({ ...current, [item.public_account_id]: result.revision }))
                              return showSecret(result.client_secret)
                            }).catch((caught) => setError(messageOf(caught)))
                          }}>重新生成密钥</Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
      {applyOpen ? <Modal title="申请虚拟账号" onClose={() => setApplyOpen(false)}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="public-account-id">account id</Label>
            <Input id="public-account-id" value={publicId} onChange={(event) => setPublicId(event.target.value)} placeholder="4 到 32 位小写字母、数字或连字符" />
          </div>
          <div>
            <Label htmlFor="purpose">用途</Label>
            <Input id="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="quota-bytes">期望字节配额</Label>
              <Input id="quota-bytes" value={quotaBytes} onChange={(event) => setQuotaBytes(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="quota-objects">期望对象配额</Label>
              <Input id="quota-objects" value={quotaObjects} onChange={(event) => setQuotaObjects(event.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">这里不创建登录用户。密钥由系统在审核通过并初始化完成后生成。</p>
          <Button type="button" onClick={() => void submitApplication()}>提交申请</Button>
        </div>
      </Modal> : null}
      {rejectTarget ? <Modal title="拒绝申请" onClose={() => setRejectTarget(null)}>
        <div className="space-y-3">
          <Label htmlFor="reject-reason">原因</Label>
          <Input id="reject-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          <Button type="button" onClick={() => {
            if (!token || !rejectTarget) return
            void rejectAccountApplication(token, rejectTarget, rejectReason).then(() => {
              setRejectTarget(null)
              return load()
            }).catch((caught) => setError(messageOf(caught)))
          }}>确认拒绝</Button>
        </div>
      </Modal> : null}
      {secretOpen ? <Modal title="client_secret 只显示这一次" onClose={() => { setSecretOpen(false); setSecret("") }}>
        <p className="break-all font-mono text-sm" data-testid="client-secret-once">{secret}</p>
        <p className="mt-3 text-xs text-muted-foreground">APPS 用它换取有时效的 token。不能用它登录 Stor。需要更换时，在这个页面重新生成。</p>
      </Modal> : null}
    </div>
  )
}
