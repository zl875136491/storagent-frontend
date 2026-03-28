import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import {
  fetchApplicationsApi,
  createApplicationApi,
  approveApplicationApi,
  type Application,
  type ApplicationCreateRequest,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { DialogFooter } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"

export default function ApplicationPage() {
  const { accessToken } = useAuth()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalTarget, setApprovalTarget] = useState<Application | null>(null)
  const [approving, setApproving] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)

  const [createForm, setCreateForm] = useState<ApplicationCreateRequest>({
    name: "",
    shown_name: "",
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

  const handleApprove = async () => {
    if (!approvalTarget || approving) return
    setApproving(true)
    try {
      // 授权接口会通过全局 toast 展示成功或失败信息
      await approveApplicationApi(approvalTarget.id, accessToken ?? undefined)
      await loadApplications()
      setApprovalTarget(null)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setApproving(false)
    }
  }

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
                          disabled={approving}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setApprovalTarget(app)}
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
                  placeholder="例如：跨区域存储前端"
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
                  placeholder="例如：CPL 的测试环境"
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
          title="确认授权应用"
          onClose={() => {
            if (approving) return
            setApprovalTarget(null)
          }}
          disableClose={approving}
        >
          <div className="space-y-4 text-sm">
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={approving}
                onClick={() => {
                  if (approving) return
                  setApprovalTarget(null)
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={approving}
                onClick={() => void handleApprove()}
              >
                {approving ? (
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-100/70 border-t-emerald-600" />
                    <span>授权中</span>
                  </span>
                ) : (
                  "确认授权"
                )}
              </Button>
            </DialogFooter>
          </div>
        </Modal>
      )}
    </div>
  )
}

