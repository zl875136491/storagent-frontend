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
import { Database, LayoutGrid, LoaderCircle, Play, Table2 } from "lucide-react"
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

function TreemapAutoLoadButton({
  hasBucket,
  active,
  onToggle,
}: {
  hasBucket: boolean
  active: boolean
  onToggle: () => void
}) {
  const [clickHint, setClickHint] = useState<string | null>(null)
  const hoverLabel = active ? "停止自动加载" : "自动连续加载桶文件列表"

  useEffect(() => {
    if (!clickHint) return
    const timer = window.setTimeout(() => setClickHint(null), 2000)
    return () => window.clearTimeout(timer)
  }, [clickHint])

  const tooltip = hasBucket ? hoverLabel : (clickHint ?? hoverLabel)

  return (
    <span
      className={cn("group relative inline-flex", !hasBucket && "cursor-not-allowed")}
      onClick={() => {
        if (!hasBucket) setClickHint("请先选择桶")
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
        disabled={!hasBucket}
        aria-label={hasBucket ? (active ? "停止自动加载" : "开始自动加载") : "自动连续加载桶文件列表"}
        aria-pressed={active}
        onClick={(event) => {
          event.stopPropagation()
          setClickHint(null)
          onToggle()
        }}
      >
        {active ? (
          <span className="relative inline-flex h-5 w-5 items-center justify-center">
            <LoaderCircle className="absolute h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            <span className="relative h-2 w-2 rounded-[1.5px] bg-red-500" aria-hidden />
          </span>
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm",
          clickHint && !hasBucket ? "block" : "hidden group-hover:block group-focus-within:block",
        )}
      >
        {tooltip}
      </span>
    </span>
  )
}

export default function BucketPage({ view }: { view: InventoryView }) {
  useDocumentTitle("服务器文件详情")
  const { accessToken } = useAuth()
  const location = useLocation()
  const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null)
  const [treemapAutoLoad, setTreemapAutoLoad] = useState(false)
  const [treemapAutoLoadActive, setTreemapAutoLoadActive] = useState(false)
  const [hasTreemapBucket, setHasTreemapBucket] = useState(false)
  const hadTreemapBucketRef = useRef(false)
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
    ready: boolean
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

  const loadBuckets = useCallback(async () => {
    const requestSeq = ++bucketRequestSeq.current
    const serverId = selectedServerId
    if (!serverId) {
      setBuckets([])
      setCacheInfo(null)
      setObjectCount(0)
      setBucketsLoading(false)
      return
    }
    setBucketsLoading(true)
    setBucketsLoadError(false)
    try {
      const resp = await fetchBucketsApi(
        serverId,
        accessToken ?? undefined,
      )
      if (requestSeq !== bucketRequestSeq.current) return
      setBuckets(resp.data)
      setObjectCount(resp.object_count ?? resp.data.reduce((sum, item) => sum + (item.object_count || 0), 0))
      setCacheInfo({
        hit: Boolean(resp.cache_hit),
        ready: resp.index_ready !== false && Boolean(resp.cached_at) && Date.parse(resp.cached_at) > 0,
        cachedAt: resp.cached_at,
        expiresAt: resp.expires_at,
        ttlSeconds: resp.ttl_seconds,
      })
      setInventoryRevision((value) => value + 1)
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

  const handleTreemapBucketChange = useCallback((bucket: string) => {
    const has = Boolean(bucket)
    if (!has) setTreemapAutoLoad(false)
    else if (!hadTreemapBucketRef.current) setTreemapAutoLoad(true)
    hadTreemapBucketRef.current = has
    setHasTreemapBucket(has)
  }, [])

  return (
    <div className="mx-auto flex min-h-0 max-w-8xl flex-col lg:h-full">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">服务器文件详情</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            按需展开目录、分页搜索对象。对象索引由后台每 6 小时同步，也可在 Celery 运维手动发起。
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
            <BrandLoading label="正在读取对象索引..." className="min-h-0 flex-1" />
          ) : bucketsLoadError ? (
            <ListErrorState
              variant="plain"
              className="min-h-0 flex-1"
              message="存储桶摘要加载失败"
              onRetry={() => void loadBuckets()}
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
                  {cacheInfo?.ready ? "Mongo 对象索引" : "索引尚未建立"}
                </span>
                <span className="text-muted-foreground">生成 {cacheInfo?.ready ? formatCacheTime(cacheInfo.cachedAt) : "—"}</span>
                <span className="text-muted-foreground">
                  下次定时同步 {formatCacheTime(
                    cacheInfo?.ready
                      ? new Date(Date.parse(cacheInfo.cachedAt) + cacheInfo.ttlSeconds * 1000).toISOString()
                      : undefined,
                  )}
                </span>
                <span className="text-muted-foreground">
                  {objectCount.toLocaleString("zh-CN")} 个对象 · {formatBytes(totalSize)}
                </span>
                {!cacheInfo?.ready ? (
                  <span className="text-amber-600 dark:text-amber-400">请到 Celery 运维手动发起「文件索引同步」</span>
                ) : cacheInfo && Date.parse(cacheInfo.cachedAt) + cacheInfo.ttlSeconds * 1000 < Date.now() ? (
                  <span className="text-amber-600 dark:text-amber-400">索引已超过 6 小时，请到 Celery 运维手动同步</span>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  {view === "treemap" ? (
                    <TreemapAutoLoadButton
                      hasBucket={hasTreemapBucket}
                      active={treemapAutoLoadActive}
                      onToggle={() => setTreemapAutoLoad((playing) => !playing)}
                    />
                  ) : null}
                  <div
                    className="flex items-center rounded-md border border-border bg-muted/40 p-0.5"
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
                </div>
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
                      autoLoad={treemapAutoLoad}
                      onBucketChange={handleTreemapBucketChange}
                      onAutoLoadActiveChange={setTreemapAutoLoadActive}
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
