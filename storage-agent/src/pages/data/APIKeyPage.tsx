import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import {
  createApiKeyApi,
  fetchApiKeysApi,
  fetchEnabledApplicationsApi,
  revokeApiKeyApi,
  type APIKey,
  type APIKeyCreateRequest,
  type SimpleApplication,
} from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { DatePicker } from "../../components/ui/date-picker"
import { CheckIcon } from "lucide-react"
import { copyTextToClipboard } from "../../lib/copy-to-clipboard"
import { formatDateTime } from "../../lib/format"
import { BrandLoading } from "../../components/BrandLoading"

export default function APIKeyPage() {
  const { accessToken, user } = useAuth()
  const isAdmin = user?.is_admin === true

  const [apiKeys, setApiKeys] = useState<APIKey[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [applications, setApplications] = useState<SimpleApplication[]>([])
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null)
  const [expiredAt, setExpiredAt] = useState<string>("")
  const [creating, setCreating] = useState(false)

  const [createdApiKey, setCreatedApiKey] = useState<APIKey | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<APIKey | null>(null)

  const loadApiKeys = async () => {
    setLoading(true)
    try {
      const resp = await fetchApiKeysApi(accessToken ?? undefined)
      setApiKeys(resp.data)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApiKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreateModal = () => {
    setShowCreateModal(true)
    setApplications([])
    setSelectedApplicationId(null)
    setExpiredAt("")
    setApplicationsLoading(true)

    fetchEnabledApplicationsApi(accessToken ?? undefined)
      .then((resp) => {
        setApplications(resp.data)
        if (resp.data.length > 0) {
          setSelectedApplicationId(resp.data[0].id)
        }
      })
      .catch(() => {
        // 错误已由 api client toast 展示
      })
      .finally(() => {
        setApplicationsLoading(false)
      })
  }

  const handleCreate = async () => {
    if (applications.length === 0) {
      showErrorToast("当前没有可用的授权应用，无法创建 APIKey。")
      return
    }

    if (!selectedApplicationId) {
      showErrorToast("请选择一个应用")
      return
    }

    const payload: APIKeyCreateRequest = {
      application_id: selectedApplicationId,
      expired_at: expiredAt ? expiredAt : null,
    }

    setCreating(true)
    try {
      const resp = await createApiKeyApi(payload, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreatedApiKey(resp)
      void loadApiKeys()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setCreating(false)
    }
  }

  const handleCopySuccess = () => {
    showSuccessToast("已复制 apikey 到剪贴板")
    setCopySuccess(true)
    window.setTimeout(() => setCopySuccess(false), 3000)
  }

  const handleCopy = async () => {
    if (!createdApiKey?.key) return

    const successful = await copyTextToClipboard(createdApiKey.key)

    if (successful) {
      handleCopySuccess()
    } else {
      showErrorToast("复制到剪贴板失败,请手动选择并复制")
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevokingId(revokeTarget.id)
    try {
      await revokeApiKeyApi(revokeTarget.id, accessToken ?? undefined)
      showSuccessToast("APIKey 已吊销")
      setRevokeTarget(null)
      void loadApiKeys()
    } catch {
      // toast 已由 client 处理
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">APIKey 管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理系统中各应用使用的 APIKey。列表中的 Key 已由后端进行掩码处理，仅用于与调用侧比对。
            {isAdmin ? " 管理员可查看并吊销其他用户的 APIKey。" : ""}
          </p>
        </div>
        <div className="sticky top-3">
          <Button type="button" size="md" onClick={openCreateModal}>
            新建 APIKey
          </Button>
        </div>
      </div>

      {loading ? (
        <BrandLoading label="正在加载 APIKey 列表..." />
      ) : apiKeys.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">暂无 APIKey 数据</div>
            <div className="text-xs text-muted-foreground">
              点击右上角「新建 APIKey」按钮，创建第一个访问密钥。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {apiKeys.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardContent className="pt-4 text-[11px] text-muted-foreground">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-[11px] text-muted-foreground/70">APIKey</div>
                    <div className="mt-1 max-w-full break-all font-mono text-sm text-foreground">
                      {item.key}
                    </div>
                    {item.destory_by_admin ? (
                      <div className="mt-2 inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        被管理人员注销
                      </div>
                    ) : item.deleted ? (
                      <div className="mt-2 inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        已吊销
                      </div>
                    ) : (
                      <div className="mt-2 inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-100">
                        可用
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[11px]">
                    <span className="inline-flex max-w-[200px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      APIKey ID：{item.id}
                    </span>
                    <div className="text-[10px] text-muted-foreground/80">失效时间</div>
                    <div className="mt-0.5 text-[11px] font-medium text-primary">
                      {formatDateTime(item.expired_at, "永久有效")}
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 border-t border-dashed border-border/70 pt-2 text-xs">
                  <div>
                    <div className="text-muted-foreground/70">绑定应用</div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-semibold text-primary">
                        {item.application.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <div className="text-xs font-medium text-foreground">
                          {item.application.shown_name || item.application.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {item.application.name} · ID：{item.application.id}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    {!item.deleted ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={revokingId === item.id}
                        onClick={() => setRevokeTarget(item)}
                      >
                        吊销
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal title="创建 APIKey" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 p-1 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs font-medium">选择应用</Label>
                {/* <span className="text-[11px] text-muted-foreground">
                  仅展示已授权的应用，用于关联生成 APIKey
                </span> */}
              </div>

              {applicationsLoading ? (
                <div className="rounded-xl bg-muted/40 px-3">
                  <BrandLoading label="正在加载应用列表..." compact iconClassName="h-5 w-5" />
                </div>
              ) : applications.length === 0 ? (
                <Card className="border-dashed bg-muted/30">
                  <CardContent className="px-3 py-2 text-[11px] text-muted-foreground">
                    <p>· 当前没有任何已授权的应用，请先在「应用管理」中创建应用。</p>
                    <p>· 如果应用已存在, 但未授权, 请联系存储管理员进行授权。</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  {applications.map((app) => (
                    <label
                      key={app.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-background"
                    >
                      <input
                        type="radio"
                        name="application"
                        value={app.id}
                        checked={selectedApplicationId === app.id}
                        onChange={(e) => setSelectedApplicationId(e.target.value)}
                        className="h-3.5 w-3.5 border-border text-primary focus:ring-0"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{app.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          显示名：{app.shown_name} · ID：{app.id}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-1 block text-xs" htmlFor="apikey-expired-at">
                失效时间（可选）
              </Label>
              <DatePicker
                id="apikey-expired-at"
                value={expiredAt}
                onChange={setExpiredAt}
                placeholder="选择失效日期"
                aria-label="选择 APIKey 失效日期"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                默认为空表示永久有效；选择日期后，APIKey 将在该日期（含）后失效。
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creating || applications.length === 0}
                onClick={() => void handleCreate()}
              >
                {creating ? (
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-100/70 border-t-emerald-600" />
                    <span>创建中</span>
                  </span>
                ) : (
                  "确认创建"
                )}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}

      {createdApiKey && (
        <Modal
          title="APIKey 创建成功"
          onClose={() => {
            setCreatedApiKey(null)
          }}
        >
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">
              请妥善保存以下 APIKey，<span className="text-red-500">该值只会展示一次</span>，后续仅能在列表中看到掩码形式。
            </p>

            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3 text-xs">
              <div>
                <div className="text-muted-foreground/70">APIKey ID</div>
                <div className="mt-0.5 break-all text-foreground/90">{createdApiKey.id}</div>
              </div>
              <div>
                <div className="mb-1 text-muted-foreground/70">APIKey</div>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    readOnly
                    value={createdApiKey.key}
                    className="font-mono text-[13px]"
                  />
                  <Button type="button" size="sm" onClick={() => void handleCopy()}>
                    {copySuccess ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : "复制"}
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground/70">失效时间</div>
                <div className="mt-0.5 text-foreground/90">
                  {formatDateTime(createdApiKey.expired_at, "永久有效")}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreatedApiKey(null)}
              >
                关闭
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}

      {revokeTarget && (
        <Modal title="确认吊销 APIKey" onClose={() => setRevokeTarget(null)}>
          <div className="space-y-4 text-sm">
            <p className="text-[13px] text-muted-foreground">
              吊销后该密钥将立即失效，且无法恢复。确定要吊销以下 APIKey 吗？
            </p>
            <div className="rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs break-all">
              {revokeTarget.key}
            </div>
            <div className="text-[11px] text-muted-foreground">
              应用：{revokeTarget.application.shown_name || revokeTarget.application.name}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={revokingId === revokeTarget.id}
                onClick={() => setRevokeTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={revokingId === revokeTarget.id}
                onClick={() => void handleRevoke()}
              >
                {revokingId === revokeTarget.id ? "吊销中…" : "确认吊销"}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  )
}
