import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import { useAuth } from "../../auth/AuthContext"
import { NavLink, useLocation } from "react-router-dom"
import {
  fetchBucketsApi,
  fetchMinioServersApi,
  type BucketFileItem,
  type BucketInfo,
  type MinioServer,
} from "../../api/client"
import { Card, CardContent } from "../../components/ui/card"
import { Database, InfoIcon, LayoutGrid, RefreshCw, Table2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import {
  BucketFileInventory,
  CopyTextButton,
} from "../../components/storage/BucketFileInventory"
import { formatBytes, formatDateTime } from "../../lib/format"
import { cn } from "../../lib/utils"
import { BrandLoading } from "../../components/BrandLoading"

type InventoryView = "treemap" | "files"

function formatCacheTime(value?: string): string {
  return formatDateTime(value, "—")
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

interface TreemapNode {
  name: string
  value?: number
  children?: TreemapNode[]
  bucketName: string
  objectKey: string
  rawSize: number
  lastModified: string
  isDirectory: boolean
}

interface TreemapTooltipInfo extends echarts.DefaultLabelFormatterCallbackParams {
  treePathInfo?: Array<{ name: string }>
}

interface TreemapSelection {
  bucketName: string
  name: string
  objectKey: string
  size: number
  lastModified: string
  isDirectory: boolean
}

function displayBucketName(name: string): string {
  return name.replace(/^Bucket:\s*/i, "")
}

function buildTreemapNodes(
  files: BucketFileItem[],
  bucketName: string,
  parentPath = "",
): TreemapNode[] {
  const toNode = (item: BucketFileItem): TreemapNode => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0
    const objectKey = parentPath ? `${parentPath}/${item.name}` : item.name
    return {
      name: item.name,
      // 仅在叶子节点上设置 value，让上层节点自动聚合
      value: hasChildren ? undefined : Math.max(item.size || 0, 1),
      children: hasChildren
        ? buildTreemapNodes(item.children!, bucketName, objectKey)
        : undefined,
      bucketName,
      objectKey,
      rawSize: item.size || 0,
      lastModified: item.last_modified,
      isDirectory: hasChildren,
    }
  }

  return files.map(toNode)
}

interface BucketTreemapProps {
  buckets: BucketInfo[]
  onSelect: (selection: TreemapSelection) => void
}

function BucketTreemap({ buckets, onSelect }: BucketTreemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const handleClick = (params: echarts.ECElementEvent) => {
      const node = params.data as TreemapNode | undefined
      if (!node?.bucketName) return
      onSelect({
        bucketName: node.bucketName,
        name: node.name,
        objectKey: node.objectKey,
        size: node.rawSize,
        lastModified: node.lastModified,
        isDirectory: node.isDirectory,
      })
    }

    chart.on("click", handleClick)
    return () => {
      chart.off("click", handleClick)
    }
  }, [onSelect])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (!buckets || buckets.length === 0) {
      chart.clear()
      return
    }

    const data = buckets.map(bucket => ({
      name: displayBucketName(bucket.name),
      children: buildTreemapNodes(bucket.files, displayBucketName(bucket.name)),
      bucketName: displayBucketName(bucket.name),
      objectKey: "",
      rawSize: bucket.total_size || 0,
      lastModified: bucket.created_at,
      isDirectory: true,
    }))

    const styles = getComputedStyle(document.documentElement)
    const primary = styles.getPropertyValue("--primary").trim() || "#22c55e"
    const secondary = styles.getPropertyValue("--secondary").trim() || "#0ea5e9"
    const accent = styles.getPropertyValue("--accent").trim() || "#6366f1"
    const muted = styles.getPropertyValue("--muted-foreground").trim() || "#6b7280"
    const fg = styles.getPropertyValue("--foreground").trim() || "#020617"
    const popover = styles.getPropertyValue("--popover").trim() || "#ffffff"
    const border = styles.getPropertyValue("--border").trim() || "#e5e7eb"

    const option: echarts.EChartsCoreOption = {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: popover,
        borderColor: border,
        borderWidth: 1,
        extraCssText: "border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,.22);padding:10px 12px;",
        textStyle: { color: fg },
        formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
          const info = (Array.isArray(params) ? params[0] : params) as
            | TreemapTooltipInfo
            | undefined
          if (!info) return ""

          const { name, value, treePathInfo } = info
          const path = (treePathInfo ?? [])
            .map((item) => item.name)
            .filter((n: string) => !!n)
            .join(" / ")

          return [
            `<div style="font-size:12px;color:${fg};font-weight:600;margin-bottom:2px;">${escapeHtml(String(name))}</div>`,
            `<div style="font-size:11px;color:${muted};">路径：${escapeHtml(path)}</div>`,
            typeof value === "number"
              ? `<div style="font-size:11px;color:${muted};margin-top:2px;">大小：${formatBytes(
                  value,
                )}</div>`
              : "",
          ].join("")
        },
      },
      series: [
        {
          type: "treemap",
          roam: true,
          nodeClick: "zoomToNode",
          visibleMin: 10,
          leafDepth: 2,
          label: {
            show: true,
            formatter: "{b}",
            fontSize: 11,
          },
          upperLabel: {
            show: true,
            height: 24,
            color: fg,
            fontSize: 11,
          },
          breadcrumb: {
            show: true,
            itemStyle: {
              color: "transparent",
              borderColor: "transparent",
            },
            textStyle: {
              color: muted,
              fontSize: 11,
            },
          },
          itemStyle: {
            borderColor: "rgba(148, 163, 184, 0.6)",
            borderWidth: 1,
            gapWidth: 1,
          },
          emphasis: {
            itemStyle: {
              borderColor: primary,
              borderWidth: 2,
            },
          },
          color: [primary, secondary, accent, "#14b8a6", "#6366f1", "#f97316"],
          data,
        },
      ],
    }

    chart.setOption(option, true)
  }, [buckets])

  return <div ref={containerRef} className="h-full w-full" />
}

export default function BucketPage({ view }: { view: InventoryView }) {
  const { accessToken } = useAuth()
  const location = useLocation()
  const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null)
  const [servers, setServers] = useState<MinioServer[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const bucketRequestSeq = useRef(0)

  const [buckets, setBuckets] = useState<BucketInfo[]>([])
  const [bucketsLoading, setBucketsLoading] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{
    hit: boolean
    cachedAt: string
    expiresAt: string
    ttlSeconds: number
  } | null>(null)

  useEffect(() => {
    const loadServers = async () => {
      setServersLoading(true)
      try {
        const resp = await fetchMinioServersApi(accessToken ?? undefined)
        setServers(resp.data)
        if (resp.data.length > 0) {
          setSelectedServerId(resp.data[0].id)
        }
      } catch {
        // 错误已由 api client toast 展示
      } finally {
        setServersLoading(false)
      }
    }

    void loadServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadBuckets = useCallback(async (refresh = false) => {
    const requestSeq = ++bucketRequestSeq.current
    const serverId = selectedServerId
    if (!serverId) {
      setBuckets([])
      setCacheInfo(null)
      setBucketsLoading(false)
      return
    }
    if (refresh) setTreemapSelection(null)
    setBucketsLoading(true)
    try {
      const resp = await fetchBucketsApi(
        serverId,
        accessToken ?? undefined,
        refresh,
      )
      if (requestSeq !== bucketRequestSeq.current) return
      setBuckets(resp.data)
      setCacheInfo({
        hit: Boolean(resp.cache_hit),
        cachedAt: resp.cached_at,
        expiresAt: resp.expires_at,
        ttlSeconds: resp.ttl_seconds,
      })
    } catch {
      // 错误已由 api client toast 展示
    } finally {
      if (requestSeq === bucketRequestSeq.current) {
        setBucketsLoading(false)
      }
    }
  }, [accessToken, selectedServerId])

  useEffect(() => {
    void loadBuckets()
  }, [loadBuckets])

  // const selectedServer = useMemo(
  //   () => servers.find((s) => s.id === selectedServerId) ?? null,
  //   [servers, selectedServerId],
  // )

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
    setBucketsLoading(true)
    setTreemapSelection(null)
  }

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">服务器文件详情</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            按 MinIO 服务查看各存储桶的空间占用、目录结构与缓存文件清单。
          </p>
        </div>
      </div>

      <div className="mb-4">
        {serversLoading ? (
          <Card className="bg-muted/40">
            <CardContent className="pt-0">
              <BrandLoading label="正在加载 MinIO 服务列表..." className="min-h-[100px]" compact />
            </CardContent>
          </Card>
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
                    {/* <div className="mt-1 text-[10px] text-muted-foreground/80">
                      ID：{server.id}
                    </div> */}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      <div>
          {bucketsLoading ? (
            <BrandLoading label="正在加载存储桶数据..." className="min-h-[600px]" />
          ) : !selectedServerId ? (
            <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground">
              请先在上方选择一个 MinIO 服务。
            </div>
          ) : buckets.length === 0 ? (
            <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground">
              当前 MinIO 服务暂无存储桶数据。
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
              <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/70 bg-background/70 px-3 py-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Database className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {cacheInfo?.hit ? "Mongo 缓存" : "MinIO 实时回源"}
                </span>
                <span className="text-muted-foreground">生成 {formatCacheTime(cacheInfo?.cachedAt)}</span>
                <span className="text-muted-foreground">到期 {formatCacheTime(cacheInfo?.expiresAt)}</span>
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
                  title="忽略缓存并重新读取 MinIO"
                  aria-label="刷新服务器文件详情"
                  onClick={() => void loadBuckets(true)}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", bucketsLoading && "animate-spin")} aria-hidden />
                </Button>
              </div>
              <div className="relative h-[calc(100vh-344px)] min-h-[420px]">
                {view === "treemap" ? (
                  <>
                    {treemapSelection ? (
                      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-md border border-border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
                        <div className="min-w-0">
                          <div
                            className="truncate text-[11px] font-medium text-foreground"
                            title={treemapSelection.name}
                          >
                            {treemapSelection.name}
                          </div>
                          <div
                            className="truncate font-mono text-[10px] text-muted-foreground"
                            title={`${treemapSelection.bucketName}/${treemapSelection.objectKey}`}
                          >
                            {treemapSelection.bucketName}
                            {treemapSelection.objectKey ? `/${treemapSelection.objectKey}` : ""}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatBytes(treemapSelection.size)} · {formatCacheTime(treemapSelection.lastModified)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 pl-1.5">
                          <CopyTextButton
                            value={treemapSelection.name}
                            label={treemapSelection.isDirectory ? "目录名" : "文件名"}
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="absolute right-3 top-3 z-10 group">
                      <div className="flex h-5 w-5 cursor-default items-center justify-center rounded-full border border-muted-foreground/60 bg-background/80 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
                        <InfoIcon className="h-4 w-4" />
                      </div>
                      <div className="pointer-events-none absolute right-0 top-7 z-20 hidden w-72 rounded-md border border-border bg-background/95 p-2 text-[11px] leading-relaxed text-muted-foreground shadow-lg group-hover:block">
                        <div>当前服务器总占用空间：{formatBytes(totalSize)}</div>
                        <div className="mt-1">
                          点击文件块后可查看对象信息，使用树图路径导航切换目录层级。
                        </div>
                      </div>
                    </div>
                    <BucketTreemap buckets={buckets} onSelect={setTreemapSelection} />
                  </>
                ) : (
                  <BucketFileInventory
                    key={selectedServerId}
                    buckets={buckets}
                    serverId={selectedServerId}
                  />
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
