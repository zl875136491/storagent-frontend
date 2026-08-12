import { useEffect, useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import {
  fetchMinioServersApi,
  updateMinioServerApi,
  type MinioServer,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { BrandLoading } from "../../components/BrandLoading"

export default function MinioPage() {
  const { accessToken, user } = useAuth()
  const isAdmin = hasPermission(user, PERMISSIONS.regionManage)
  const [servers, setServers] = useState<MinioServer[]>([])
  const [loading, setLoading] = useState(true)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftWeight, setDraftWeight] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)

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
      </div>

      {loading ? (
        <BrandLoading label="正在加载 MinIO 服务列表..." />
      ) : servers.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">暂无 MinIO 服务配置</div>
            <div className="text-xs text-muted-foreground">当前系统尚未注册任何 MinIO 服务，请联系管理员完成配置。</div>
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
                    <div className="text-muted-foreground/70">MinIO FQDN</div>
                    <div className="mt-0.5 break-all font-mono text-xs text-foreground/80">
                      {server.host}:{server.minio_port}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Domain</div>
                    <div className="mt-0.5 break-all font-mono text-xs text-foreground/80">{server.domain || "未配置"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Storagent API 端口</div>
                    <div className="mt-0.5 font-mono text-xs text-foreground/80">{server.server_port}</div>
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
    </div>
  )
}
