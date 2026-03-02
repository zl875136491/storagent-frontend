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
import { Modal } from "../../components/Modal"

export default function MinioPage() {
  const { accessToken } = useAuth()
  const [servers, setServers] = useState<MinioServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [regionsError, setRegionsError] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState<Omit<MinioServerCreateRequest, "port"> & { port: string }>({
    region: "",
    name: "",
    host: "",
    port: "",
    access_key: "",
    secret_key: "",
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadServers = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetchMinioServersApi(accessToken ?? undefined)
      setServers(resp.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 MinIO 服务列表失败")
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
    setRegionsError(null)
    fetchRegionsApi(accessToken ?? undefined)
      .then((resp) => {
        setRegions(resp.data)
      })
      .catch((err) => {
        setRegionsError(err instanceof Error ? err.message : "加载区域列表失败")
      })
      .finally(() => {
        setRegionsLoading(false)
      })
  }

  const handleCreate = async () => {
    if (!createForm.region) {
      setCreateError("请选择所属区域")
      return
    }
    if (!createForm.name || !createForm.host || !createForm.port) {
      setCreateError("请至少填写名称、主机地址和端口")
      return
    }

    const portNumber = Number.parseInt(createForm.port, 10)
    if (Number.isNaN(portNumber) || portNumber <= 0) {
      setCreateError("端口号必须为大于 0 的数字")
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
    setCreateError(null)
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
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建 MinIO 服务失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">MinIO 服务管理</h1>
          <p className="mt-1 text-xs text-slate-500">
            管理 MinIO 存储服务实例，并与基础区域数据建立关联。
          </p>
        </div>
        <div className="sticky top-3">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-500/30 hover:bg-emerald-400"
          >
            新建 MinIO 服务
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
            <div className="text-xs text-slate-500">
              正在加载 MinIO 服务列表...
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      ) : servers.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
          <div className="mb-2 text-sm font-medium text-slate-700">
            暂无 MinIO 服务配置
          </div>
          <div className="mb-3 text-xs text-slate-400">
            点击右上角「新建 MinIO 服务」按钮，创建第一个存储实例。
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-xs font-semibold text-emerald-600">
                      M
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {server.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    所属区域：{server.region.name}
                  </div>
                </div>
                <span className="inline-flex max-w-[140px] items-center justify-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                  {server.id}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-dashed border-slate-100 pt-3 text-[11px] text-slate-600">
                <div>
                  <div className="text-slate-400">主机地址</div>
                  <div className="mt-0.5 break-all text-xs text-slate-800">
                    {server.host}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">端口</div>
                  <div className="mt-0.5 text-xs text-slate-800">
                    {server.port}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Access Key</div>
                  <div className="mt-0.5 truncate text-xs text-slate-800">
                    {server.access_key}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Secret Key</div>
                  <div className="mt-0.5 truncate text-xs text-slate-800">
                    {server.secret_key}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal title="新建 MinIO 服务" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  所属区域
                </label>
                <span className="text-[11px] text-slate-400">
                  从现有区域中选择（Radio 形式）
                </span>
              </div>

              {regionsLoading ? (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
                  正在加载区域列表...
                </div>
              ) : regionsError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  {regionsError}
                </div>
              ) : regions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  尚未配置任何区域，请先在「区域管理」中创建区域。
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                  {regions.map((region) => (
                    <label
                      key={region.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white"
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
                        className="h-3.5 w-3.5 border-slate-300 text-emerald-500 focus:ring-0"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-slate-900">
                          {region.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
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
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  服务名称
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                  placeholder="例如：华东主存储"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  端口
                </label>
                <input
                  type="number"
                  value={createForm.port}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, port: e.target.value }))
                  }
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                  placeholder="例如：9000"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                主机地址
              </label>
              <input
                type="text"
                value={createForm.host}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, host: e.target.value }))
                }
                className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                placeholder="例如：http://10.0.0.1"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Access Key
                </label>
                <input
                  type="text"
                  value={createForm.access_key}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      access_key: e.target.value,
                    }))
                  }
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                  placeholder="请输入 Access Key"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Secret Key
                </label>
                <input
                  type="text"
                  value={createForm.secret_key}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      secret_key: e.target.value,
                    }))
                  }
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                  placeholder="请输入 Secret Key"
                />
              </div>
            </div>

            {createError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {createError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                取消
              </button>
              <button
                type="button"
                disabled={creating || regions.length === 0}
                onClick={() => {
                  void handleCreate()
                }}
                className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {creating ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

