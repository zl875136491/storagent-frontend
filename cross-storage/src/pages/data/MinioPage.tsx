import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import {
  createMinioServerApi,
  fetchMinioServersApi,
  fetchRegionsApi,
  type MinioServer,
  type MinioServerCreateRequest,
  type Region,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"

export default function MinioPage() {
  const { accessToken } = useAuth()
  const [servers, setServers] = useState<MinioServer[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)

  const [createForm, setCreateForm] = useState<
    Omit<MinioServerCreateRequest, "port"> & { port: string }
  >({
    region: "",
    name: "",
    host: "",
    port: "",
    access_key: "",
    secret_key: "",
  })
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

  const openCreateModal = () => {
    setShowCreateModal(true)
    setRegionsLoading(true)
    fetchRegionsApi(accessToken ?? undefined)
      .then((resp) => {
        setRegions(resp.data)
      })
      .catch(() => {
        // 错误已由 api client toast 展示
      })
      .finally(() => {
        setRegionsLoading(false)
      })
  }

  const handleCreate = async () => {
    if (!createForm.region) {
      showErrorToast("请选择所属区域")
      return
    }
    if (!createForm.name || !createForm.host || !createForm.port) {
      showErrorToast("请至少填写名称、主机地址和端口")
      return
    }

    const portNumber = Number.parseInt(createForm.port, 10)
    if (Number.isNaN(portNumber) || portNumber <= 0) {
      showErrorToast("端口号必须为大于 0 的数字")
      return
    }

    const payload: MinioServerCreateRequest = {
      region: createForm.region,
      name: createForm.name,
      host: createForm.host,
      port: portNumber,
      access_key: createForm.access_key,
      secret_key: createForm.secret_key,
    }

    setCreating(true)
    try {
      await createMinioServerApi(payload, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({
        region: "",
        name: "",
        host: "",
        port: "",
        access_key: "",
        secret_key: "",
      })
      void loadServers()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">MinIO 服务管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理 MinIO 存储服务实例，并与基础区域数据建立关联。
          </p>
        </div>
        <div className="sticky top-3">
          <Button
            type="button"
            size="md"
            onClick={openCreateModal}
            className="bg-emerald-500 text-emerald-50 hover:bg-emerald-400"
          >
            新建 MinIO 服务
          </Button>
        </div>
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
            <div className="text-sm font-medium text-foreground">
              暂无 MinIO 服务配置
            </div>
            <div className="text-xs text-muted-foreground">
              点击右上角「新建 MinIO 服务」按钮，创建第一个存储实例。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {servers.map((server) => (
            <Card key={server.id} className="flex flex-col">
              <CardContent className="pt-4 text-[11px] text-muted-foreground">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-[11px] font-semibold text-emerald-600">
                        {/* 获取 MinIO 服务名称的第一个字符 */}
                        {server.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {server.name}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      所属区域：{server.region.name}
                    </div>
                  </div>
                  <span className="inline-flex max-w-[140px] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {server.id}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-dashed border-border/70 pt-3">
                  <div>
                    <div className="text-muted-foreground/70">主机地址</div>
                    <div className="mt-0.5 break-all text-xs text-foreground/80">
                      {server.host}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">端口</div>
                    <div className="mt-0.5 text-xs text-foreground/80">
                      {server.port}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Access Key</div>
                    <div className="mt-0.5 truncate text-xs text-foreground/80">
                      {server.access_key}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Secret Key</div>
                    <div className="mt-0.5 truncate text-xs text-foreground/80">
                      {server.secret_key}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal title="新建 MinIO 服务" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs font-medium">所属区域</Label>
                {/* <span className="text-[11px] text-muted-foreground">
                  从现有区域中选择
                </span> */}
              </div>

              {regionsLoading ? (
                <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-border/60 border-t-primary" />
                  正在加载区域列表...
                </div>
              ) : regions.length === 0 ? (
                <Card className="border-dashed bg-muted/30">
                  <CardContent className="px-3 py-2 text-[11px] text-muted-foreground">
                    尚未配置任何区域，请先在「区域管理」中创建区域。
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  {regions.map((region) => (
                    <label
                      key={region.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-background"
                    >
                      <input
                        type="radio"
                        name="region"
                        value={region.id}
                        checked={createForm.region === region.id}
                        onChange={(e) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            region: e.target.value,
                          }))
                        }
                        className="h-3.5 w-3.5 border-border text-emerald-500 focus:ring-0"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">
                          {region.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          简称：{region.nickname} · ID：{region.id}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs" htmlFor="minio-name">
                  服务名称
                </Label>
                <Input
                  id="minio-name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="例如：华东主存储"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs" htmlFor="minio-port">
                  端口
                </Label>
                <Input
                  id="minio-port"
                  type="number"
                  value={createForm.port}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, port: e.target.value }))
                  }
                  placeholder="例如：9000"
                />
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs" htmlFor="minio-host">
                主机地址
              </Label>
              <Input
                id="minio-host"
                type="text"
                value={createForm.host}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, host: e.target.value }))
                }
                placeholder="例如：http://10.0.0.1"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs" htmlFor="minio-access">
                  Access Key
                </Label>
                <Input
                  id="minio-access"
                  type="text"
                  value={createForm.access_key}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      access_key: e.target.value,
                    }))
                  }
                  placeholder="请输入 Access Key"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs" htmlFor="minio-secret">
                  Secret Key
                </Label>
                <Input
                  id="minio-secret"
                  type="text"
                  value={createForm.secret_key}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      secret_key: e.target.value,
                    }))
                  }
                  placeholder="请输入 Secret Key"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
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
                disabled={creating || regions.length === 0}
                onClick={() => {
                  void handleCreate()
                }}
                className="bg-emerald-500 text-emerald-50 hover:bg-emerald-400 disabled:bg-emerald-300"
              >
                {creating ? "创建中..." : "确认创建"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

