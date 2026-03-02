import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import {
  createRegionApi,
  fetchRegionsApi,
  type Region,
  type RegionCreateRequest,
} from "../../api/client"
import { Modal } from "../../components/Modal"

export default function RegionPage() {
  const { accessToken } = useAuth()
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<RegionCreateRequest>({
    name: "",
    nickname: "",
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadRegions = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetchRegionsApi(accessToken ?? undefined)
      setRegions(resp.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载区域列表失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRegions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    if (!createForm.name || !createForm.nickname) {
      setCreateError("请填写完整的区域名称和简称")
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      await createRegionApi(createForm, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({ name: "", nickname: "" })
      void loadRegions()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建区域失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">区域管理</h1>
          <p className="mt-1 text-xs text-slate-500">
            维护系统中的区域信息，供 MinIO 服务等模块进行关联选择。
          </p>
        </div>
        <div className="sticky top-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-sky-500/30 hover:bg-sky-400"
          >
            新建区域
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
            <div className="text-xs text-slate-500">正在加载区域列表...</div>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      ) : regions.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
          <div className="mb-2 text-sm font-medium text-slate-700">
            暂无区域数据
          </div>
          <div className="mb-3 text-xs text-slate-400">
            点击右上角「新建区域」按钮，创建第一个区域。
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {regions.map((region) => (
            <div
              key={region.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-50 text-xs font-semibold text-sky-600">
                    R 
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {region.name}
                  </div>
                </div>
                <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {region.nickname}
                </span>
              </div>
              <div className="mt-2 border-t border-dashed border-slate-100 pt-2">
                <div className="text-[11px] text-slate-400">区域 ID</div>
                <div className="mt-0.5 truncate text-xs text-slate-700">
                  {region.id}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <Modal title="新建区域" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 text-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                区域名称
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                placeholder="例如：华东区域"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                区域简称
              </label>
              <input
                type="text"
                value={createForm.nickname}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, nickname: e.target.value }))
                }
                className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:bg-white"
                placeholder="例如：华东"
              />
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
                disabled={creating}
                onClick={() => {
                  void handleCreate()
                }}
                className="inline-flex items-center rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-300"
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

