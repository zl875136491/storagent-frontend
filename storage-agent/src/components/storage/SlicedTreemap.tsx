import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronRight, Folder, File, MoreHorizontal, LoaderCircle } from "lucide-react"

import {
  fetchInventoryChildrenApi,
  type InventoryNode,
} from "../../api/client"
import { formatBytes, formatDateTime } from "../../lib/format"
import { squarify } from "../../lib/squarify"
import { cn } from "../../lib/utils"
import { CopyTextButton } from "./BucketFileInventory"
import { ListErrorState } from "../ListErrorState"

const PAGE_SIZE = 40
const AUTO_LOAD_DELAY_MS = 320
const MAX_AUTO_TILES = 4096
const TILE_ANIMATION_LIMIT = 600

export interface TreemapSelection {
  bucketName: string
  name: string
  objectKey: string
  size: number
  lastModified: string
  isDirectory: boolean
}

interface Crumb {
  label: string
  bucket: string
  prefix: string
}

interface LevelState {
  items: InventoryNode[]
  total: number
  parentSize: number
  hasMore: boolean
}

interface TileData {
  node: InventoryNode
}

function displayBucketName(name: string): string {
  return name.replace(/^Bucket:\s*/i, "")
}

function crumbKey(crumb: Crumb): string {
  return `${crumb.bucket}\0${crumb.prefix}`
}

function nodeValue(node: InventoryNode): number {
  return Math.max(node.size, 1)
}

const TILE_TONES = [
  "#5abd7a",
  "#51a96e",
  "#489561",
  "#3f8155",
  "#366d49",
  "#2d593c",
  "#244530",
  "#1b3124",
] as const

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function tilePaint(node: InventoryNode): { backgroundColor: string; accent: string; light: boolean } {
  const key = `${node.kind}:${node.bucket}:${node.object_key}:${node.name}`
  const hash = hashString(key)
  const tone = TILE_TONES[hash % TILE_TONES.length]
  const light = tone === "#5abd7a" || tone === "#51a96e" || tone === "#489561"
  return {
    backgroundColor: tone,
    accent: light ? "#09090b" : "#5abd7a",
    light,
  }
}

export function SlicedTreemap({
  serverId,
  accessToken,
  onSelect,
  autoLoad = false,
  onBucketChange,
  onAutoLoadActiveChange,
}: {
  serverId: string
  accessToken?: string
  onSelect: (selection: TreemapSelection) => void
  autoLoad?: boolean
  onBucketChange?: (bucket: string) => void
  onAutoLoadActiveChange?: (active: boolean) => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const requestSeq = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: "全部存储桶", bucket: "", prefix: "" }])
  const [level, setLevel] = useState<LevelState>({ items: [], total: 0, parentSize: 0, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const current = crumbs[crumbs.length - 1]

  useEffect(() => {
    if (!frameRef.current) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [])

  const loadLevel = useCallback(async (
    crumb: Crumb,
    offset = 0,
    append = false,
    fromAuto = false,
  ) => {
    if (append && fromAuto && offset >= MAX_AUTO_TILES) return
    const seq = ++requestSeq.current
    if (append) setLoadingMore(true)
    else {
      setLoading(true)
      setError(false)
    }
    try {
      const response = await fetchInventoryChildrenApi(
        serverId,
        {
          bucket: crumb.bucket || undefined,
          prefix: crumb.prefix || undefined,
          offset,
          limit: PAGE_SIZE,
          sort: "size",
          order: "desc",
        },
        accessToken,
      )
      if (seq !== requestSeq.current) return
      setLevel((currentLevel) => {
        const items = append ? [...currentLevel.items, ...response.items] : response.items
        return {
          items,
          total: response.total,
          parentSize: response.parent_size,
          hasMore: response.has_more,
        }
      })
      if (!append) {
        onSelect({
          bucketName: crumb.bucket,
          name: crumb.label,
          objectKey: crumb.prefix,
          size: response.parent_size,
          lastModified: "",
          isDirectory: true,
        })
      }
    } catch {
      if (seq === requestSeq.current) setError(true)
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [accessToken, onSelect, serverId])

  useEffect(() => {
    void loadLevel(current, 0, false)
  }, [current, loadLevel])

  useEffect(() => {
    onBucketChange?.(current.bucket)
  }, [current.bucket, onBucketChange])

  useEffect(() => {
    return () => onBucketChange?.("")
  }, [onBucketChange])

  const autoLoadActive = Boolean(
    autoLoad
    && current.bucket
    && !error
    && (loading || loadingMore || (level.hasMore && level.items.length < MAX_AUTO_TILES)),
  )

  useEffect(() => {
    onAutoLoadActiveChange?.(autoLoadActive)
  }, [autoLoadActive, onAutoLoadActiveChange])

  useEffect(() => {
    return () => onAutoLoadActiveChange?.(false)
  }, [onAutoLoadActiveChange])

  useEffect(() => {
    if (!autoLoad || !current.bucket || error) return
    if (loading || loadingMore) return
    if (!level.hasMore) return
    if (level.items.length >= MAX_AUTO_TILES) return
    const timer = window.setTimeout(() => {
      void loadLevel(current, level.items.length, true, true)
    }, AUTO_LOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [
    autoLoad,
    current,
    error,
    level.hasMore,
    level.items.length,
    loadLevel,
    loading,
    loadingMore,
  ])

  const loadedSize = useMemo(
    () => level.items.reduce((sum, item) => sum + Math.max(item.size, 0), 0),
    [level.items],
  )
  const remainingCount = Math.max(level.total - level.items.length, 0)
  const remainingSize = Math.max(level.parentSize - loadedSize, 0)
  const railVertical = size.width >= size.height
  const remainderThickness = remainingCount > 0
    ? Math.min(72, Math.max(52, Math.round((railVertical ? size.width : size.height) * 0.055)))
    : 0
  const mapWidth = Math.max(railVertical ? size.width - remainderThickness : size.width, 1)
  const mapHeight = Math.max(railVertical ? size.height : size.height - remainderThickness, 1)

  const tiles = useMemo(() => {
    const entries: Array<{ value: number; data: TileData }> = level.items.map((node) => ({
      value: nodeValue(node),
      data: { node },
    }))
    return squarify(entries, mapWidth, mapHeight, 0)
  }, [level.items, mapHeight, mapWidth])
  const animateTiles = level.items.length <= TILE_ANIMATION_LIMIT

  const openNode = (node: InventoryNode) => {
    onSelect({
      bucketName: displayBucketName(node.bucket || node.name),
      name: node.name,
      objectKey: node.object_key,
      size: node.size,
      lastModified: node.last_modified,
      isDirectory: node.kind === "dir",
    })
    if (node.kind !== "dir") return
    const next: Crumb = node.bucket && !current.bucket
      ? { label: displayBucketName(node.name), bucket: displayBucketName(node.name), prefix: "" }
      : {
          label: node.name,
          bucket: current.bucket || displayBucketName(node.bucket),
          prefix: node.object_key,
        }
    setCrumbs((values) => [...values, next])
  }

  const jumpTo = (index: number) => {
    setCrumbs((values) => values.slice(0, index + 1))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-3 py-2 text-[11px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <span key={crumbKey(crumb)} className="inline-flex items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden /> : null}
              {last ? (
                <span className="font-medium text-foreground">{crumb.label}</span>
              ) : (
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => jumpTo(index)}
                >
                  {crumb.label}
                </button>
              )}
            </span>
          )
        })}
        <span className="ml-auto text-muted-foreground">
          已显示 {level.items.length.toLocaleString("zh-CN")} / {level.total.toLocaleString("zh-CN")} 项
          {level.parentSize > 0 ? ` · ${formatBytes(level.parentSize)}` : ""}
        </span>
      </nav>
      <div ref={frameRef} className="relative min-h-0 flex-1">
        {error ? (
          <ListErrorState
            variant="plain"
            className="h-full"
            message="目录内容加载失败"
            onRetry={() => void loadLevel(current, 0, false)}
            retrying={loading}
          />
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            正在加载当前目录…
          </div>
        ) : level.items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            当前目录没有可显示的对象
          </div>
        ) : (
          <div className="absolute inset-0 isolate overflow-hidden">
            {tiles.map((tile) => {
              const node = tile.data.node
              if (!node) return null
              const directory = node.kind === "dir"
              const tooSmall = tile.width < 72 || tile.height < 44
              const paint = tilePaint(node)
              return (
                <button
                  key={`${node.kind}:${node.bucket}:${node.object_key}:${node.name}`}
                  type="button"
                  style={{
                    left: tile.x,
                    top: tile.y,
                    width: tile.width,
                    height: tile.height,
                    backgroundColor: paint.backgroundColor,
                  }}
                  className={cn(
                    "absolute box-border min-h-0 min-w-0 overflow-hidden rounded-none border-0 p-0 text-left leading-none outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    animateTiles && "transition-[left,top,width,height,filter] duration-300 ease-out",
                  )}
                  title={`${node.name}\n${formatBytes(node.size)}`}
                  aria-label={`${directory ? "目录" : "文件"} ${node.name}`}
                  onClick={() => openNode(node)}
                >
                  <span className={`flex h-full min-h-0 min-w-0 flex-col ${tooSmall ? "p-0" : "px-1.5 py-1"}`}>
                    <span className="flex min-w-0 items-center gap-1">
                      {directory ? (
                        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: paint.accent }} aria-hidden />
                      ) : (
                        <File className="h-3.5 w-3.5 shrink-0" style={{ color: paint.accent }} aria-hidden />
                      )}
                      <span className={`truncate text-[11px] font-medium leading-tight ${paint.light ? "text-background" : "text-foreground"}`}>{node.name}</span>
                    </span>
                    {!tooSmall ? (
                      <span className={`mt-auto text-[10px] leading-tight ${paint.light ? "text-background/70" : "text-muted-foreground"}`}>
                        {formatBytes(node.size)}
                        {directory && node.object_count > 0
                          ? ` · ${node.object_count.toLocaleString("zh-CN")} 个对象`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
            {remainingCount > 0 ? (
              <button
                type="button"
                disabled={loadingMore}
                style={{
                  left: railVertical ? mapWidth : 0,
                  top: railVertical ? 0 : mapHeight,
                  width: railVertical ? remainderThickness : size.width,
                  height: railVertical ? size.height : remainderThickness,
                }}
                className="absolute z-10 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-none border border-dashed border-primary/25 bg-muted/70 px-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-70"
                title={`加载其余 ${remainingCount.toLocaleString("zh-CN")} 项`}
                aria-label={`加载其余 ${remainingCount.toLocaleString("zh-CN")} 项`}
                onClick={() => void loadLevel(current, level.items.length, true, false)}
              >
                {loadingMore ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                )}
                <span className="text-center text-[11px] font-medium">
                  其余 {remainingCount.toLocaleString("zh-CN")} 项
                </span>
                <span className="text-[10px]">{formatBytes(remainingSize)}</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export function TreemapSelectionCard({
  selection,
}: {
  selection: TreemapSelection
}) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-md border border-border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-foreground" title={selection.name}>
          {selection.name}
        </div>
        <div
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={`${selection.bucketName}/${selection.objectKey}`}
        >
          {selection.bucketName}
          {selection.objectKey ? `/${selection.objectKey}` : ""}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {formatBytes(selection.size)} · {formatDateTime(selection.lastModified, "—")}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 pl-1.5">
        <CopyTextButton
          value={selection.name}
          label={selection.isDirectory ? "目录名" : "文件名"}
        />
      </div>
    </div>
  )
}
