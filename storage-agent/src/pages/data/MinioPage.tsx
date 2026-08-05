import { useEffect, useState } from "react"
import { Check, Pencil, Plus, X } from "lucide-react"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import {
  createMinioServerApi,
  fetchMinioServersApi,
  fetchRegionsApi,
  updateMinioServerApi,
  type MinioServer,
  type MinioServerCreateRequest,
  type Region,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"

const emptyCreateForm = (): MinioServerCreateRequest => ({
  region: "",
  name: "",
  host: "",
  server_port: 9000,
  minio_port: 9000,
  access_key: "",
  secret_key: "",
  replicate_weight: 0,
})

export default function MinioPage() {
  const { accessToken, user } = useAuth()
  const isAdmin = hasPermission(user, PERMISSIONS.regionManage)
  const [servers, setServers] = useState<MinioServer[]>([])
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftWeight, setDraftWeight] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [createForm, setCreateForm] = useState<MinioServerCreateRequest>(emptyCreateForm)
  const [creating, setCreating] = useState(false)

  const loadServers = async () => {
    setLoading(true)
    try {
      const resp = await fetchMinioServersApi(accessToken ?? undefined)
      setServers(resp.data)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setEditingId(null)
      setDraftWeight("")
    }
  }, [isAdmin])

  const openCreate = () => {
    setCreateForm(emptyCreateForm())
    setShowCreate(true)
    fetchRegionsApi(accessToken ?? undefined)
      .then((resp) => {
        setRegions(resp.data)
        if (resp.data.length > 0) {
          setCreateForm((f) => ({ ...f, region: resp.data[0].id }))
        }
      })
      .catch(() => {
        setRegions([])
      })
  }

  const handleCreate = async () => {
    if (!createForm.region) {
      showErrorToast("请选择区域")
      return
    }
    if (!createForm.name.trim() || !createForm.host.trim()) {
      showErrorToast("请填写名称与主机地址")
      return
    }
    if (!createForm.access_key.trim() || !createForm.secret_key.trim()) {
      showErrorToast("请填写 Access Key 与 Secret Key")
      return
    }
    setCreating(true)
    try {
      await createMinioServerApi(
        {
          ...createForm,
          name: createForm.name.trim(),
          host: createForm.host.trim(),
          access_key: createForm.access_key.trim(),
          secret_key: createForm.secret_key.trim(),
        },
        accessToken ?? undefined,
      )
      setShowCreate(false)
      void loadServers()
    } catch {
      // toast
    } finally {
      setCreating(false)
    }
  }

  const startEditWeight = (server: MinioServer) => {
    setEditingId(server.id)
    setDraftWeight(String(server.replicate_weight ?? 0))
  }

  const cancelEditWeight = () => {
    setEditingId(null)
    setDraftWeight("")
  }

  const confirmEditWeight = async (serverId: string) => {
    const trimmed = draftWeight.trim()
    if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
      showErrorToast("复制集权重须为整数")
      return
    }
    const weight = Number.parseInt(trimmed, 10)
    if (!Number.isSafeInteger(weight)) {
      showErrorToast("复制集权重超出可表示范围")
      return
    }

    setSavingId(serverId)
    try {
      const updated = await updateMinioServerApi(
        serverId,
        { replicate_weight: weight },
        accessToken ?? undefined,
      )
      setServers((prev) => prev.map((s) => (s.id === serverId ? updated : s)))
      cancelEditWeight()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">MinIO 服务管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            查看已注册的 MinIO 存储服务实例及其与区域的关联；复制集权重用于跨站复制调度。
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="md" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            注册 MinIO
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-emerald-500" />
            <div>正在加载 MinIO 服务列表...</div>
          </div>
        </div>
      ) : servers.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">暂无 MinIO 服务配置</div>
            <div className="text-xs text-muted-foreground">
              {isAdmin
                ? "点击右上角「注册 MinIO」添加第一个服务实例。"
                : "当前系统尚未注册任何 MinIO 服务，请联系管理员完成配置。"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <Card key={server.id} className="flex flex-col">
              <CardContent className="pt-4 text-[11px] text-muted-foreground">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-[11px] font-semibold text-emerald-600">
                        {server.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-semibold text-foreground">{server.name}</div>
                      {server.master ? (
                        <span className="rounded bg-primary/15 px-1.5 py-px text-[9px] font-medium text-primary">
                          本节点
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      所属区域：{server.region.shown_name} ({server.region.name})
                    </div>
                  </div>
                  <span className="inline-flex max-w-[140px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {server.id}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-dashed border-border/70 pt-3">
                  <div>
                    <div className="text-muted-foreground/70">主机地址</div>
                    <div className="mt-0.5 break-all text-xs text-foreground/80">{server.host}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">服务端口</div>
                    <div className="mt-0.5 font-mono text-xs text-foreground/80">{server.server_port}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">MinIO 端口</div>
                    <div className="mt-0.5 font-mono text-xs text-foreground/80">{server.minio_port}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">复制集权重</div>
                    <div className="mt-0.5 flex min-h-7 flex-nowrap items-center gap-0.5">
                      {isAdmin && editingId === server.id ? (
                        <>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="-?[0-9]*"
                            value={draftWeight}
                            onChange={(e) => setDraftWeight(e.target.value)}
                            className="h-7 w-[3.25rem] min-w-0 shrink rounded-md px-2 py-0 font-mono text-xs leading-none shadow-none ring-offset-0 focus-visible:ring-1"
                            disabled={savingId === server.id}
                            aria-label="复制集权重"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                            disabled={savingId === server.id}
                            title="确认"
                            onClick={() => {
                              void confirmEditWeight(server.id)
                            }}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground"
                            disabled={savingId === server.id}
                            title="取消"
                            onClick={cancelEditWeight}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex min-h-7 items-center font-mono text-xs leading-none text-foreground/80">
                            {server.replicate_weight ?? 0}
                          </span>
                          {isAdmin ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              title="修改复制集权重"
                              onClick={() => startEditWeight(server)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="注册 MinIO 服务" onClose={() => setShowCreate(false)}>
          <div className="space-y-3 p-1 text-sm">
            <div>
              <Label className="mb-1 block text-xs">所属区域</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.region}
                onChange={(e) => setCreateForm((f) => ({ ...f, region: e.target.value }))}
              >
                {regions.length === 0 ? (
                  <option value="">暂无区域，请先创建</option>
                ) : (
                  regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.shown_name} ({r.name})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">名称</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如 beijing-minio"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">主机</Label>
                <Input
                  value={createForm.host}
                  onChange={(e) => setCreateForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="10.0.0.1"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">API 端口 (server_port)</Label>
                <Input
                  type="number"
                  value={createForm.server_port}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, server_port: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">MinIO 端口 (minio_port)</Label>
                <Input
                  type="number"
                  value={createForm.minio_port}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, minio_port: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Access Key</Label>
                <Input
                  value={createForm.access_key}
                  onChange={(e) => setCreateForm((f) => ({ ...f, access_key: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Secret Key</Label>
                <Input
                  type="password"
                  value={createForm.secret_key}
                  onChange={(e) => setCreateForm((f) => ({ ...f, secret_key: e.target.value }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">复制集权重</Label>
                <Input
                  type="number"
                  value={createForm.replicate_weight ?? 0}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      replicate_weight: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creating || regions.length === 0}
                onClick={() => void handleCreate()}
              >
                {creating ? "注册中…" : "确认注册"}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  )
}
