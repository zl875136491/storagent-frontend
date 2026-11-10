import { useCallback, useMemo, useState } from "react"
import { KeyRound, Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react"
import {
  createVirtualTenant,
  fetchVirtualAccount,
  fetchVirtualTenants,
  postTenantAction,
  updateVirtualTenantQuota,
  VirtualStorageApiError,
  type TenantCreateResult,
  type VirtualAccountView,
  type VirtualTenant,
} from "../../api/virtualStorage"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Modal } from "../../components/Modal"
import { useDocumentTitle } from "../../lib/useDocumentTitle"

const APP_KEY = "vs_console_app_name"
const CREDENTIAL_KEY = "vs_console_credential"

const STATE_LABEL: Record<string, string> = {
  active: "活跃",
  frozen: "冻结",
  retiring: "注销中",
  purge_pending: "清除中",
  retired: "已注销",
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** index
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`
}

function occupiedBytes(tenant: VirtualTenant): number {
  return tenant.quota_bytes_used + tenant.quota_bytes_reserved + tenant.quota_bytes_trashed
}

function messageOf(error: unknown): string {
  if (error instanceof VirtualStorageApiError) return error.message
  if (error instanceof Error) return error.message
  return "请求失败"
}

export default function TenantManagePage() {
  useDocumentTitle("虚拟存储租户管理")
  const [appName, setAppName] = useState(() => sessionStorage.getItem(APP_KEY) ?? "apps")
  const [credential, setCredential] = useState(() => sessionStorage.getItem(CREDENTIAL_KEY) ?? "")
  const [account, setAccount] = useState<VirtualAccountView | null>(null)
  const [tenants, setTenants] = useState<VirtualTenant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [issuedKey, setIssuedKey] = useState<TenantCreateResult | null>(null)
  const [quotaTarget, setQuotaTarget] = useState<VirtualTenant | null>(null)
  const [form, setForm] = useState({
    external_tenant_id: "",
    logical_name: "",
    quota_bytes: "1073741824",
    quota_objects: "1000",
  })
  const [quotaForm, setQuotaForm] = useState({ quota_bytes: "", quota_objects: "" })

  const signedIn = Boolean(account)

  const load = useCallback(async (nextApp = appName, nextCredential = credential) => {
    setLoading(true)
    setError("")
    try {
      const [nextAccount, nextTenants] = await Promise.all([
        fetchVirtualAccount(nextApp, nextCredential),
        fetchVirtualTenants(nextApp, nextCredential),
      ])
      sessionStorage.setItem(APP_KEY, nextApp)
      sessionStorage.setItem(CREDENTIAL_KEY, nextCredential)
      setAccount(nextAccount)
      setTenants(nextTenants)
    } catch (caught) {
      setAccount(null)
      setTenants([])
      setError(messageOf(caught))
    } finally {
      setLoading(false)
    }
  }, [appName, credential])

  async function signIn() {
    await load(appName.trim(), credential)
  }

  function signOut() {
    sessionStorage.removeItem(CREDENTIAL_KEY)
    setCredential("")
    setAccount(null)
    setTenants([])
  }

  async function createTenant() {
    setCreating(true)
    setError("")
    try {
      const created = await createVirtualTenant(appName.trim(), credential, {
        external_tenant_id: form.external_tenant_id.trim(),
        logical_name: form.logical_name.trim(),
        quota_bytes: Number(form.quota_bytes),
        quota_objects: Number(form.quota_objects),
      })
      setIssuedKey(created)
      setForm((current) => ({ ...current, external_tenant_id: "", logical_name: "" }))
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setCreating(false)
    }
  }

  async function runAction(tenant: VirtualTenant, action: "freeze" | "unfreeze" | "retire" | "cancel-retire") {
    setError("")
    try {
      await postTenantAction(appName.trim(), credential, tenant.tenant_id, action)
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  async function saveQuota() {
    if (!quotaTarget) return
    setError("")
    try {
      await updateVirtualTenantQuota(
        appName.trim(),
        credential,
        quotaTarget,
        Number(quotaForm.quota_bytes),
        Number(quotaForm.quota_objects),
      )
      setQuotaTarget(null)
      await load()
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  const accountOccupied = useMemo(() => {
    if (!account) return 0
    return account.quota_bytes_used + account.quota_bytes_reserved + account.quota_bytes_trashed
  }, [account])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">虚拟存储租户管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              使用账号管理凭据。租户 Key 只在创建成功时显示一次，普通查询不会再返回明文。
            </p>
          </div>
          {signedIn ? (
            <Button variant="outline" onClick={signOut}>退出管理凭据</Button>
          ) : null}
        </header>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">管理凭据</h2>
          </CardHeader>
          <CardContent className="grid gap-3 pb-5 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="vs-app">应用名</Label>
              <Input id="vs-app" value={appName} onChange={(event) => setAppName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="vs-credential">管理凭据</Label>
              <Input
                id="vs-credential"
                type="password"
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
              />
            </div>
            <Button className="md:self-end" disabled={loading || !appName.trim() || !credential} onClick={() => void signIn()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              进入
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {account ? (
          <>
            <Card>
              <CardContent className="grid gap-3 py-5 sm:grid-cols-4">
                <Metric label="归属区域" value={account.home_region} />
                <Metric label="已占用 / 总配额" value={`${formatBytes(accountOccupied)} / ${formatBytes(account.quota_bytes_total)}`} />
                <Metric label="已分配" value={formatBytes(account.quota_bytes_allocated)} />
                <Metric label="预留 / 回收站" value={`${formatBytes(account.quota_bytes_reserved)} / ${formatBytes(account.quota_bytes_trashed)}`} />
              </CardContent>
            </Card>

            <Card>
              <div className="px-5 pt-5">
                <h2 className="text-sm font-semibold">新建租户</h2>
              </div>
              <CardContent className="grid gap-3 pb-5 md:grid-cols-4">
                <Field label="外部租户 ID" value={form.external_tenant_id} onChange={(value) => setForm({ ...form, external_tenant_id: value })} />
                <Field label="逻辑名" value={form.logical_name} onChange={(value) => setForm({ ...form, logical_name: value })} />
                <Field label="字节配额" value={form.quota_bytes} onChange={(value) => setForm({ ...form, quota_bytes: value })} />
                <Field label="对象数配额" value={form.quota_objects} onChange={(value) => setForm({ ...form, quota_objects: value })} />
                <Button
                  className="md:col-span-4 md:justify-self-start"
                  disabled={creating || !form.external_tenant_id.trim() || !form.logical_name.trim()}
                  onClick={() => void createTenant()}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  创建并交付 Key
                </Button>
              </CardContent>
            </Card>

            <Card>
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="text-sm font-semibold">租户</h2>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </Button>
              </div>
              <CardContent className="overflow-x-auto pb-5">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">逻辑名</th>
                      <th className="py-2 pr-3 font-medium">外部 ID / 代际</th>
                      <th className="py-2 pr-3 font-medium">状态</th>
                      <th className="py-2 pr-3 font-medium">占用</th>
                      <th className="py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-muted-foreground">还没有租户</td>
                      </tr>
                    ) : tenants.map((tenant) => (
                      <tr key={tenant.tenant_id} className="border-t border-border/70">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{tenant.logical_name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{tenant.tenant_id}</div>
                        </td>
                        <td className="py-3 pr-3">
                          {tenant.external_tenant_id}
                          <div className="text-xs text-muted-foreground">第 {tenant.generation} 代</div>
                        </td>
                        <td className="py-3 pr-3">{STATE_LABEL[tenant.state] ?? tenant.state}</td>
                        <td className="py-3 pr-3">
                          {formatBytes(occupiedBytes(tenant))} / {formatBytes(tenant.quota_bytes_total)}
                          <div className="text-xs text-muted-foreground">
                            使用 {formatBytes(tenant.quota_bytes_used)} · 预留 {formatBytes(tenant.quota_bytes_reserved)} · 回收站 {formatBytes(tenant.quota_bytes_trashed)}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            {tenant.state === "active" ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { setQuotaTarget(tenant); setQuotaForm({ quota_bytes: String(tenant.quota_bytes_total), quota_objects: String(tenant.quota_objects_total) }) }}>配额</Button>
                                <Button size="sm" variant="outline" onClick={() => void runAction(tenant, "freeze")}>冻结</Button>
                                <Button size="sm" variant="destructive" onClick={() => void runAction(tenant, "retire")}>注销</Button>
                              </>
                            ) : null}
                            {tenant.state === "frozen" ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => void runAction(tenant, "unfreeze")}>解冻</Button>
                                <Button size="sm" variant="destructive" onClick={() => void runAction(tenant, "retire")}>注销</Button>
                              </>
                            ) : null}
                            {tenant.state === "retiring" && !tenant.purge_started ? (
                              <Button size="sm" variant="outline" onClick={() => void runAction(tenant, "cancel-retire")}>撤销注销</Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {issuedKey ? (
        <Modal title="租户 Key 只显示这一次" onClose={() => setIssuedKey(null)}>
          <div className="space-y-3 text-sm">
            <p>租户 {issuedKey.logical_name} 已创建。关闭后不能再查询这把明文 Key。</p>
            {issuedKey.plaintext_available && issuedKey.api_key ? (
              <div className="rounded-xl bg-muted px-3 py-2 font-mono text-xs break-all">{issuedKey.api_key}</div>
            ) : (
              <p>交付窗口已结束，响应里没有明文。</p>
            )}
            <div className="text-xs text-muted-foreground">Key ID：{issuedKey.key_id || "未返回"}</div>
            <Button
              variant="outline"
              disabled={!issuedKey.api_key}
              onClick={() => { if (issuedKey.api_key) void navigator.clipboard.writeText(issuedKey.api_key) }}
            >
              <KeyRound className="h-4 w-4" />
              复制 Key
            </Button>
          </div>
        </Modal>
      ) : null}

      {quotaTarget ? (
        <Modal title={`调整 ${quotaTarget.logical_name} 的配额`} onClose={() => setQuotaTarget(null)}>
          <div className="grid gap-3">
            <Field label="字节配额" value={quotaForm.quota_bytes} onChange={(value) => setQuotaForm({ ...quotaForm, quota_bytes: value })} />
            <Field label="对象数配额" value={quotaForm.quota_objects} onChange={(value) => setQuotaForm({ ...quotaForm, quota_objects: value })} />
            <p className="text-xs text-muted-foreground">新配额不能小于已占用额度。软删除仍计入占用。</p>
            <Button onClick={() => void saveQuota()}>保存</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
