import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import {
  fetchApplicationsApi,
  createApplicationApi,
  fetchRegionsApi,
  type Application,
  type ApplicationCreateRequest,
  type Region,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"

export default function ApplicationPage() {
  const { accessToken } = useAuth()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [regions, setRegions] = useState<Region[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)

  const [createForm, setCreateForm] = useState<ApplicationCreateRequest>({
    name: "",
    description: "",
    regions: [],
  })
  const [creating, setCreating] = useState(false)

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

  const toggleRegion = (regionId: string) => {
    setCreateForm((prev) => {
      const exists = prev.regions.includes(regionId)
      return {
        ...prev,
        regions: exists
          ? prev.regions.filter((id) => id !== regionId)
          : [...prev.regions, regionId],
      }
    })
  }

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      showErrorToast("请填写应用名称")
      return
    }

    if (!createForm.description.trim()) {
      showErrorToast("请填写应用描述")
      return
    }

    if (createForm.regions.length === 0) {
      showErrorToast("请至少选择一个关联区域")
      return
    }

    setCreating(true)
    try {
      await createApplicationApi(createForm, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({
        name: "",
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

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">应用管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            管理业务应用，并与区域等基础数据建立关联。
          </p>
        </div>
        <div className="sticky top-3">
          <Button
            type="button"
            size="md"
            onClick={openCreateModal}
            className="bg-sky-500 text-sky-50 hover:bg-sky-400"
          >
            新建应用
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-sky-500" />
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
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/10 text-[11px] font-semibold text-sky-600">
                        A
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {app.name}
                      </div>
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
                      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        app.enabled
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {app.enabled ? "已启用" : "未启用"}
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
                  <div className="md:col-span-2">
                    <div className="text-muted-foreground/70">关联区域</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {app.regions.map((region) => (
                        <span
                          key={region.id}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {region.name}
                          {region.nickname ? `（${region.nickname}）` : ""}
                        </span>
                      ))}
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
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs" htmlFor="app-name">
                  应用名称
                </Label>
                <Input
                  id="app-name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="例如：CPL"
                />
              </div>
              <div>
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
                  placeholder="例如：CPL 的测试环境"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs font-medium">关联区域</Label>
                <span className="text-[11px] text-muted-foreground">
                  可多选，将应用关联到多个区域
                </span>
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
                        type="checkbox"
                        value={region.id}
                        checked={createForm.regions.includes(region.id)}
                        onChange={() => toggleRegion(region.id)}
                        className="h-3.5 w-3.5 border-border text-sky-500 focus:ring-0"
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
                className="bg-sky-500 text-sky-50 hover:bg-sky-400 disabled:bg-sky-300"
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

