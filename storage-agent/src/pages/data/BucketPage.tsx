import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import { NavLink, useLocation } from "react-router-dom"
import {
  fetchBucketsApi,
  fetchMinioServersApi,
  type BucketInfo,
  type MinioServer,
} from "../../api/client"
import { Card, CardContent } from "../../components/ui/card"
import { Database, LayoutGrid, RefreshCw, Table2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { BucketFileInventory } from "../../components/storage/BucketFileInventory"
import {
  SlicedTreemap,
  TreemapSelectionCard,
  type TreemapSelection,
} from "../../components/storage/SlicedTreemap"
import { formatBytes, formatDateTime } from "../../lib/format"
import { cn } from "../../lib/utils"
import { BrandLoading } from "../../components/BrandLoading"
import { ListErrorState } from "../../components/ListErrorState"
import { useDocumentTitle } from "../../lib/useDocumentTitle"

type InventoryView = "treemap" | "files"

function formatCacheTime(value?: string): string {
  return formatDateTime(value, "—")
}

export default function BucketPage({ view }: { view: InventoryView }) {
  useDocumentTitle("服务器文件详情")
  const { accessToken } = useAuth()
  const location = useLocation()
  const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null)
  const [servers, setServers] = useState<MinioServer[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [serversLoadError, setServersLoadError] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const bucketRequestSeq = useRef(0)

  const [buckets, setBuckets] = useState<BucketInfo[]>([])
  const [bucketsLoading, setBucketsLoading] = useState(false)
  const [bucketsLoadError, setBucketsLoadError] = useState(false)
  const [inventoryRevision, setInventoryRevision] = useState(0)
  const [objectCount, setObjectCount] = useState(0)
  const [cacheInfo, setCacheInfo] = useState<{
    hit: boolean
    cachedAt: string
    expiresAt: string
    ttlSeconds: number
  } | null>(null)

  const loadServers = useCallback(async () => {
    setServersLoading(true)
    setServersLoadError(false)
    try {
      const resp = await fetchMinioServersApi(accessToken ?? undefined)
      setServers(resp.data)
      if (resp.data.length > 0) {
        setSelectedServerId(resp.data[0].id)
      }
    } catch {
      setServersLoadError(true)
    } finally {
      setServersLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  const loadBuckets = useCallback(async (refresh = false) => {
    const requestSeq = ++bucketRequestSeq.current
    const serverId = selectedServerId
    if (!serverId) {
      setBuckets([])
      setCacheInfo(null)
      setObjectCount(0)
      setBucketsLoading(false)
      return
    }
    if (refresh) setTreemapSelection(null)
    setBucketsLoading(true)
    setBucketsLoadError(false)
    try {
      const resp = await fetchBucketsApi(
        serverId,
        accessToken ?? undefined,
        refresh,
      )
      if (requestSeq !== bucketRequestSeq.current) return
      setBuckets(resp.data)
      setObjectCount(resp.object_count ?? resp.data.reduce((sum, item) => sum + (item.object_count || 0), 0))
      setCacheInfo({
        hit: Boolean(resp.cache_hit),
        cachedAt: resp.cached_at,
        expiresAt: resp.expires_at,
        ttlSeconds: resp.ttl_seconds,
      })
      if (refresh) setInventoryRevision((value) => value + 1)
    } catch {
      if (requestSeq === bucketRequestSeq.current) setBucketsLoadError(true)
    } finally {
      if (requestSeq === bucketRequestSeq.current) {
        setBucketsLoading(false)
      }
    }
  }, [accessToken, selectedServerId])

  useEffect(() => {
    void loadBuckets()
  }, [loadBuckets])

  const totalSize = useMemo(
    () => buckets.reduce((sum, b) => sum + (b.total_size || 0), 0),
    [buckets],
  )

  const selectServer = (serverId: string) => {
    if (serverId === selectedServerId) return
    bucketRequestSeq.current += 1
    setSelectedServerId(serverId)
    setBuckets([])
    setCacheInfo(null)
    setObjectCount(0)
    setBucketsLoading(true)
    setTreemapSelection(null)
    setInventoryRevision((value) => value + 1)
  }

  return (
    <div className="mx-auto flex min-h-0 max-w-8xl flex-col lg:h-full">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">服务器文件详情</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            按需展开目录、分页搜索对象。体积越大的目录和文件占的面积越大。
          </p>
        </div>
      </div>

      <div className="mb-4 shrink-0">
        {serversLoading ? (
          <Card className="bg-muted/40">
            <CardContent className="pt-0">
              <BrandLoading label="正在加载 MinIO 服务列表..." className="min-h-[100px]" compact />
            </CardContent>
          </Card>
        ) : serversLoadError ? (
          <ListErrorState
            message="MinIO 服务列表加载失败"
            onRetry={() => void loadServers()}
            retrying={serversLoading}
          />
        ) : servers.length === 0 ? (
          <Card className="border-dashed bg-muted/40">
            <CardContent className="flex flex-col gap-1 pt-4 text-xs text-muted-foreground">
              <span>当前暂无 MinIO 服务配置。</span>
              <span>请联系管理员在后端注册 MinIO 服务后刷新本页。</span>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-3 overflow-x-auto p-1">
            {servers.map((server) => {
              const active = server.id === selectedServerId
              return (
                <Card
                  key={server.id}
                  className={`min-w-[160px] cursor-pointer transition-all ${
                    active
                      ? "ring-2 ring-emerald-500"
                      : "hover:-translate-y-0.5 hover:ring-emerald-400/70"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onClick={() => selectServer(server.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    selectServer(server.id)
                  }}
                >
                  <CardContent className="pt-4 text-[11px] text-muted-foreground flex flex-row gap-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-[11px] font-semibold text-emerald-600">
                          {server.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between">
                      <div className="text-sm flex items-center justify-between font-semibold text-foreground">{server.name}</div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        区域：{server.region.name}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {bucketsLoading ? (
            <BrandLoading label="正在同步对象索引..." className="min-h-0 flex-1" />
          ) : bucketsLoadError ? (
            <ListErrorState
              variant="plain"
              className="min-h-0 flex-1"
              message="存储桶摘要加载失败"
              onRetry={() => void loadBuckets(true)}
              retrying={bucketsLoading}
            />
          ) : !selectedServerId ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
              请先在上方选择一个 MinIO 服务。
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/40">
              <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/70 bg-background/70 px-3 py-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Database className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {cacheInfo?.hit ? "Mongo 对象索引" : "已从 MinIO 重建索引"}
                </span>
                <span className="text-muted-foreground">生成 {formatCacheTime(cacheInfo?.cachedAt)}</span>
                <span className="text-muted-foreground">
                  建议刷新 {formatCacheTime(
                    cacheInfo
                      ? new Date(Date.parse(cacheInfo.cachedAt) + cacheInfo.ttlSeconds * 1000).toISOString()
                      : undefined,
                  )}
                </span>
                <span className="text-muted-foreground">
                  {objectCount.toLocaleString("zh-CN")} 个对象 · {formatBytes(totalSize)}
                </span>
                {cacheInfo && Date.parse(cacheInfo.cachedAt) + cacheInfo.ttlSeconds * 1000 < Date.now() ? (
                  <span className="text-amber-600 dark:text-amber-400">索引已超过建议刷新时间，浏览仍走数据库；需要最新对象时再刷新</span>
                ) : null}
                <div
                  className="ml-auto flex items-center rounded-md border border-border bg-muted/40 p-0.5"
                  role="group"
                  aria-label="文件详情视图"
                >
                  <NavLink
                    to={{ pathname: "/data/storage/buckets/treemap", search: location.search }}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      view === "treemap" && "bg-background text-foreground shadow-sm hover:bg-background",
                    )}
                    aria-current={view === "treemap" ? "page" : undefined}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                    树形图
                  </NavLink>
                  <NavLink
                    to={{ pathname: "/data/storage/buckets/files", search: location.search }}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      view === "files" && "bg-background text-foreground shadow-sm hover:bg-background",
                    )}
                    aria-current={view === "files" ? "page" : undefined}
                  >
                    <Table2 className="h-3.5 w-3.5" aria-hidden />
                    文件列表
                  </NavLink>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md"
                  disabled={bucketsLoading}
                  title="忽略索引并重新读取 MinIO"
                  aria-label="刷新服务器文件详情"
                  onClick={() => void loadBuckets(true)}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", bucketsLoading && "animate-spin")} aria-hidden />
                </Button>
              </div>
              <div className="relative min-h-0 flex-1">
                {view === "treemap" ? (
                  <>
                    {treemapSelection ? <TreemapSelectionCard selection={treemapSelection} /> : null}
                    <SlicedTreemap
                      key={`${selectedServerId}:${inventoryRevision}`}
                      serverId={selectedServerId}
                      accessToken={accessToken ?? undefined}
                      onSelect={setTreemapSelection}
                    />
                  </>
                ) : (
                  <BucketFileInventory
                    key={`${selectedServerId}:${inventoryRevision}`}
                    buckets={buckets}
                    serverId={selectedServerId}
                    revision={inventoryRevision}
                  />
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
