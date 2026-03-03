import { useEffect, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
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

export default function RegionPage() {
  const { accessToken } = useAuth()
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<RegionCreateRequest>({
    name: "",
    nickname: "",
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
    if (!createForm.name || !createForm.nickname) {
      showErrorToast("请填写完整的区域名称和简称")
      return
    }

    setCreating(true)
    try {
      await createRegionApi(createForm, accessToken ?? undefined)
      setShowCreateModal(false)
      setCreateForm({ name: "", nickname: "" })
      void loadRegions()
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
          <h1 className="text-lg font-semibold">区域管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            维护系统中的区域信息，供 MinIO 服务等模块进行关联选择。
          </p>
        </div>
        <div className="sticky top-3">
          <Button size="md" onClick={() => setShowCreateModal(true)}>
            新建区域
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-primary" />
            <div>正在加载区域列表...</div>
          </div>
        </div>
      ) : regions.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">
              暂无区域数据
            </div>
            <div className="text-xs text-muted-foreground">
              点击右上角「新建区域」按钮，创建第一个区域。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {regions.map((region) => (
            <Card key={region.id} className="flex flex-col">
              <CardContent className="pt-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                      {region.nickname.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {region.name}
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {region.nickname}
                  </span>
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

      {showCreateModal && (
        <Modal title="新建区域" onClose={() => setShowCreateModal(false)}>
          <div className="space-y-4 text-sm">
            <div>
              <Label className="mb-1 block text-xs" htmlFor="region-name">
                区域名称
              </Label>
              <Input
                id="region-name"
                type="text"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="例如：华东区域"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs" htmlFor="region-nickname">
                区域简称
              </Label>
              <Input
                id="region-nickname"
                type="text"
                value={createForm.nickname}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, nickname: e.target.value }))
                }
                placeholder="例如：华东"
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

