import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import { useAuth } from "../../auth/AuthContext"
import {
  fetchBucketsApi,
  fetchMinioServersApi,
  type BucketFileItem,
  type BucketInfo,
  type MinioServer,
} from "../../api/client"
import { Card, CardContent } from "../../components/ui/card"
import { Database, InfoIcon, RefreshCw } from "lucide-react"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`
}

function formatCacheTime(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

interface TreemapNode {
  name: string
  value?: number
  children?: TreemapNode[]
}

interface TreemapTooltipInfo extends echarts.DefaultLabelFormatterCallbackParams {
  treePathInfo?: Array<{ name: string }>
}

function buildTreemapNodes(files: BucketFileItem[]): TreemapNode[] {
  const toNode = (item: BucketFileItem): TreemapNode => {
    const hasChildren = Array.isArray(item.children) && item.children.length > 0
    return {
      name: item.name,
      // 仅在叶子节点上设置 value，让上层节点自动聚合
      value: hasChildren ? undefined : Math.max(item.size || 0, 1),
      children: hasChildren ? item.children!.map(toNode) : undefined,
    }
  }

  return files.map(toNode)
}

interface BucketTreemapProps {
  buckets: BucketInfo[]
}

function BucketTreemap({ buckets }: BucketTreemapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart

    const handleResize = () => {
      chart.resize()
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (!buckets || buckets.length === 0) {
      chart.clear()
      return
    }

    const data = buckets.map(bucket => ({
      name: bucket.name,
      children: buildTreemapNodes(bucket.files),
    }))

    const styles = getComputedStyle(document.documentElement)
    const primary = styles.getPropertyValue("--primary").trim() || "#22c55e"
    const secondary = styles.getPropertyValue("--secondary").trim() || "#0ea5e9"
    const accent = styles.getPropertyValue("--accent").trim() || "#6366f1"
    const muted = styles.getPropertyValue("--muted-foreground").trim() || "#6b7280"
    const fg = styles.getPropertyValue("--foreground").trim() || "#020617"

    const option: echarts.EChartsCoreOption = {
      backgroundColor: "transparent",
      tooltip: {
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
            `<div style="font-size:12px;color:${fg};font-weight:600;margin-bottom:2px;">${name}</div>`,
            `<div style="font-size:11px;color:${muted};">路径：${path}</div>`,
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

export default function BucketPage() {
  const { accessToken } = useAuth()
  const [servers, setServers] = useState<MinioServer[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)

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
    if (!selectedServerId) {
      setBuckets([])
      setCacheInfo(null)
      return
    }
      setBucketsLoading(true)
      try {
        const resp = await fetchBucketsApi(
          selectedServerId,
          accessToken ?? undefined,
          refresh,
        )
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
        setBucketsLoading(false)
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

  return (
    <div className="mx-auto max-w-8xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">服务器文件详情</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            按 MinIO 服务查看各存储桶的空间占用与目录结构，以树图方式直观展示。
          </p>
        </div>
      </div>

      <div className="mb-4">
        {serversLoading ? (
          <Card className="flex min-h-[100px] items-center justify-center bg-muted/40">
            <CardContent className="flex items-center gap-2 pt-0 text-xs text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border/60 border-t-emerald-500" />
              正在加载 MinIO 服务列表...
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
                  }`}
                  onClick={() => setSelectedServerId(server.id)}
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
            <div className="flex min-h-[600px] flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-primary" />
              <div>正在加载存储桶数据...</div>
            </div>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7"
                  disabled={bucketsLoading}
                  title="忽略缓存并重新读取 MinIO"
                  aria-label="刷新服务器文件详情"
                  onClick={() => void loadBuckets(true)}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", bucketsLoading && "animate-spin")} aria-hidden />
                </Button>
              </div>
              <div className="relative h-[calc(100vh-344px)] min-h-[420px]">
                <div className="absolute right-3 top-3 z-10 group">
                  <div className="flex h-5 w-5 cursor-default items-center justify-center rounded-full border border-muted-foreground/60 bg-background/80 text-[10px] font-medium text-muted-foreground backdrop-blur-sm">
                    <InfoIcon className="h-4 w-4" />
                  </div>
                  <div className="pointer-events-none absolute right-0 top-7 z-20 hidden w-72 rounded-md border border-border bg-background/95 p-2 text-[11px] leading-relaxed text-muted-foreground shadow-lg group-hover:block">
                    <div>当前服务器总占用空间：{formatBytes(totalSize)}</div>
                    <div className="mt-1">
                      点击树图中的块可查看对应目录或文件的路径与大小，使用上方路径导航在各级目录间切换。
                    </div>
                  </div>
                </div>
                <BucketTreemap buckets={buckets} />
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
