import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import {
  createRegionApi,
  fetchRegionsApi,
  type Region,
  type RegionCreateRequest,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Modal } from "../../components/Modal"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { BrandLoading } from "../../components/BrandLoading"

export default function RegionPage() {
  const { accessToken, user } = useAuth()
  const isAdmin = hasPermission(user, PERMISSIONS.regionManage)
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<RegionCreateRequest>({
    name: "",
    shown_name: "",
  })
  const [creating, setCreating] = useState(false)

  const loadRegions = async () => {
    setLoading(true)
    try {
      const resp = await fetchRegionsApi(accessToken ?? undefined)
      setRegions(resp.data)
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRegions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    if (!createForm.name || !createForm.shown_name) {
      showErrorToast("请填写完整的 RID 和显示名称")
      return
    }

    setCreating(true)
    try {
      await createRegionApi(createForm, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({ name: "", shown_name: "" })
      void loadRegions()
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">区域管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            维护系统中的区域信息，供 MinIO 服务等模块进行关联选择。
          </p>
        </div>
        {isAdmin ? <div className="sticky top-3">
          <Button size="md" onClick={() => setShowCreateModal(true)}>
            新建区域
          </Button>
        </div> : null}
      </div>

      {loading ? (
        <BrandLoading label="正在加载区域列表..." />
      ) : regions.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">
              暂无区域数据
            </div>
            <div className="text-xs text-muted-foreground">
              {isAdmin ? "点击右上角「新建区域」按钮，创建第一个区域。" : "暂无可查看的区域。"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {regions.map((region) => (
            <Card key={region.id} className="flex flex-col">
              <CardContent className="pt-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                        {(region.shown_name || region.name).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 text-sm font-semibold text-foreground">
                        {region.shown_name || region.name}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      RID：{region.name}
                    </div>
                  </div>
                </div>
                <div className="mt-2 border-t border-dashed border-border/70 pt-2">
                  <div className="text-[11px] text-muted-foreground">区域 ID</div>
                  <div className="mt-0.5 truncate text-xs text-foreground/80">
                    {region.id}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isAdmin && showCreateModal && (
        <Modal title="新建区域" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 p-1 text-sm">
            <div>
              <Label className="mb-1 block text-xs" htmlFor="region-shown-name">
                显示名称
              </Label>
              <Input
                id="region-shown-name"
                type="text"
                value={createForm.shown_name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, shown_name: e.target.value }))
                }
                placeholder="例如：华东"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs" htmlFor="region-name">
                RID
              </Label>
              <Input
                id="region-name"
                type="text"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="例如：east-cn"
              />
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
                disabled={creating}
                onClick={() => {
                  void handleCreate()
                }}
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
