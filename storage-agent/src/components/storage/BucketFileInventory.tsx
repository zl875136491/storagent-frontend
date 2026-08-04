import { useMemo, useState, type ReactNode } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  File,
  FolderSearch,
  Search,
} from "lucide-react"

import type { BucketFileItem, BucketInfo } from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { copyTextToClipboard } from "../../lib/copy-to-clipboard"
import { formatBytes, formatDateTime } from "../../lib/format"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"

const FILE_PAGE_SIZES = [25, 50, 100] as const

type PageSize = (typeof FILE_PAGE_SIZES)[number]

interface FlatBucketFile {
  id: string
  bucketName: string
  name: string
  objectKey: string
  size: number
  lastModified: string
}

function displayBucketName(name: string): string {
  return name.replace(/^Bucket:\s*/i, "")
}

function flattenBucketFiles(buckets: BucketInfo[]): FlatBucketFile[] {
  const rows: FlatBucketFile[] = []

  const walk = (bucketName: string, items: BucketFileItem[], parentPath = "") => {
    items.forEach((item) => {
      const objectKey = parentPath ? `${parentPath}/${item.name}` : item.name
      if (Array.isArray(item.children) && item.children.length > 0) {
        walk(bucketName, item.children, objectKey)
        return
      }
      rows.push({
        id: `${bucketName}\u0000${objectKey}`,
        bucketName,
        name: item.name,
        objectKey,
        size: item.size || 0,
        lastModified: item.last_modified,
      })
    })
  }

  buckets.forEach((bucket) => walk(displayBucketName(bucket.name), bucket.files))
  return rows.sort((left, right) =>
    left.bucketName.localeCompare(right.bucketName, "zh-CN")
      || left.objectKey.localeCompare(right.objectKey, "zh-CN"),
  )
}

function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  )
}

export function CopyTextButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const successful = await copyTextToClipboard(value)
    if (!successful) {
      showErrorToast("复制失败，请手动选择并复制")
      return
    }
    setCopied(true)
    showSuccessToast(`${label}已复制`)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <IconTooltip label={`复制${label}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
        aria-label={`复制${label}`}
        onClick={() => void copy()}
      >
        {copied
          ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </Button>
    </IconTooltip>
  )
}

export function BucketFileInventory({ buckets }: { buckets: BucketInfo[] }) {
  const [selectedBucket, setSelectedBucket] = useState("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const files = useMemo(() => flattenBucketFiles(buckets), [buckets])
  const bucketNames = useMemo(
    () => buckets.map((bucket) => displayBucketName(bucket.name)),
    [buckets],
  )

  const activeBucket = selectedBucket === "all" || bucketNames.includes(selectedBucket)
    ? selectedBucket
    : "all"

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
    return files.filter((file) => {
      if (activeBucket !== "all" && file.bucketName !== activeBucket) return false
      if (!normalizedQuery) return true
      return file.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || file.objectKey.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || file.bucketName.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
        || `${file.bucketName}/${file.objectKey}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    })
  }, [activeBucket, files, query])

  const pageCount = Math.max(1, Math.ceil(filteredFiles.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const rows = filteredFiles.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const firstRow = filteredFiles.length === 0 ? 0 : safePage * pageSize + 1
  const lastRow = Math.min((safePage + 1) * pageSize, filteredFiles.length)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/20">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/40 px-3 py-2">
        <select
          value={activeBucket}
          onChange={(event) => {
            setSelectedBucket(event.target.value)
            setPage(0)
          }}
          className="h-8 min-w-36 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="选择存储桶"
        >
          <option value="all">全部存储桶</option>
          {bucketNames.map((bucketName) => (
            <option key={bucketName} value={bucketName}>{bucketName}</option>
          ))}
        </select>
        <div className="relative min-w-[220px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder={activeBucket === "all" ? "搜索全部缓存文件" : `搜索 ${activeBucket}`}
            className="h-8 rounded-md pl-8"
            aria-label="搜索缓存文件"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {filteredFiles.length.toLocaleString("zh-CN")} / {files.length.toLocaleString("zh-CN")} 个对象
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <FolderSearch className="h-8 w-8 opacity-60" aria-hidden />
            <span>{query ? "缓存中没有匹配的文件" : "当前范围内没有文件"}</span>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[190px] pl-3">文件名</TableHead>
                <TableHead className="min-w-[220px]">对象路径</TableHead>
                <TableHead className="min-w-[100px]">存储桶</TableHead>
                <TableHead className="w-24 text-right">大小</TableHead>
                <TableHead className="min-w-[150px]">最后修改</TableHead>
                <TableHead className="w-20 pr-3 text-right">复制</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="max-w-[260px] pl-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <File className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="truncate font-medium text-foreground" title={file.name}>{file.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <span className="block truncate font-mono text-[11px] text-muted-foreground" title={file.objectKey}>
                      {file.objectKey}
                    </span>
                  </TableCell>
                  <TableCell>{file.bucketName}</TableCell>
                  <TableCell className="text-right font-mono text-[11px]">{formatBytes(file.size)}</TableCell>
                  <TableCell>{formatDateTime(file.lastModified)}</TableCell>
                  <TableCell className="pr-3">
                    <div className="flex justify-end gap-0.5">
                      <CopyTextButton value={file.name} label="文件名" />
                      <CopyTextButton
                        value={`${file.bucketName}/${file.objectKey}`}
                        label="完整对象路径"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span>显示 {firstRow.toLocaleString("zh-CN")}-{lastRow.toLocaleString("zh-CN")}，共 {filteredFiles.length.toLocaleString("zh-CN")} 个对象</span>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            每页
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as PageSize)
                setPage(0)
              }}
              className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="每页文件数"
            >
              {FILE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-md"
            disabled={safePage === 0}
            title="上一页"
            aria-label="上一页"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <span className="min-w-16 text-center text-foreground">{safePage + 1} / {pageCount}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-md"
            disabled={safePage >= pageCount - 1}
            title="下一页"
            aria-label="下一页"
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
