import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  File,
  FolderSearch,
  Link2,
  LoaderCircle,
  Search,
} from "lucide-react"

import {
  createAdminObjectDownloadLinkApi,
  getApiBaseUrl,
  type BucketFileItem,
  type BucketInfo,
} from "../../api/client"
import { showErrorToast, showSuccessToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { copyTextToClipboard } from "../../lib/copy-to-clipboard"
import { formatBytes, formatDateTime, parseBackendDate } from "../../lib/format"
import { Modal } from "../Modal"
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
type SortKey = "size" | "lastModified"
type SortDirection = "asc" | "desc"

interface SortState {
  key: SortKey
  direction: SortDirection
}

interface FlatBucketFile {
  id: string
  bucketName: string
  name: string
  objectKey: string
  size: number
  lastModified: string
}

interface DownloadLinkView {
  file: FlatBucketFile
  url: string
  expiresAt?: string | null
  expiresInSeconds?: number
  singleUse: boolean
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

function CopyFileName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const successful = await copyTextToClipboard(name)
    if (!successful) {
      showErrorToast("复制失败，请手动选择并复制")
      return
    }
    setCopied(true)
    showSuccessToast("文件名已复制")
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <File className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="group relative min-w-0 flex-1">
        <button
          type="button"
          className="inline-flex w-full min-w-0 items-center gap-1 rounded-sm text-left font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`复制文件名 ${name}`}
          title={copied ? "已复制文件名" : "点击复制文件名"}
          onClick={() => void copy()}
        >
          <span className="truncate">{name}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <Copy
              className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-within:opacity-70"
              aria-hidden
            />
          )}
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] font-normal text-popover-foreground shadow-sm group-hover:block group-focus-within:block"
        >
          {copied ? "已复制文件名" : "点击复制文件名"}
        </span>
      </span>
    </div>
  )
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-55" aria-hidden />
  return direction === "asc"
    ? <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    : <ArrowDown className="h-3.5 w-3.5" aria-hidden />
}

const ONE_TIME_DOWNLOAD_PATH = "/api/storage/objects/one-time-download"
const ONE_TIME_DOWNLOAD_TOKEN = /^[A-Za-z0-9_-]{32,128}$/

function resolveAdminDownloadUrl(value: string): string | null {
  try {
    const base = `${getApiBaseUrl().replace(/\/$/, "")}/`
    const resolved = new URL(value, base)
    const token = new URLSearchParams(resolved.hash.slice(1)).get("token")
    if (
      resolved.pathname !== ONE_TIME_DOWNLOAD_PATH
      || resolved.search
      || !token
      || !ONE_TIME_DOWNLOAD_TOKEN.test(token)
    ) return null
    return new URL(`${ONE_TIME_DOWNLOAD_PATH}#token=${encodeURIComponent(token)}`, base).toString()
  } catch {
    return null
  }
}

function formatLinkLifetime(seconds?: number): string {
  if (!seconds || seconds <= 0) return "短时有效"
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} 分钟`
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

export function BucketFileInventory({
  buckets,
  serverId,
}: {
  buckets: BucketInfo[]
  serverId: string
}) {
  const { accessToken, user } = useAuth()
  const isAdmin = hasPermission(user, PERMISSIONS.storageOperationsManage)
  const [selectedBucket, setSelectedBucket] = useState("all")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [detailTarget, setDetailTarget] = useState<FlatBucketFile | null>(null)
  const [generatingFileId, setGeneratingFileId] = useState<string | null>(null)
  const [downloadLink, setDownloadLink] = useState<DownloadLinkView | null>(null)
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

  const sortedFiles = useMemo(() => {
    if (!sort) return filteredFiles

    return [...filteredFiles].sort((left, right) => {
      const leftValue = sort.key === "size"
        ? left.size
        : (parseBackendDate(left.lastModified)?.getTime() ?? 0)
      const rightValue = sort.key === "size"
        ? right.size
        : (parseBackendDate(right.lastModified)?.getTime() ?? 0)
      const difference = leftValue - rightValue
      if (difference !== 0) return sort.direction === "asc" ? difference : -difference
      return left.bucketName.localeCompare(right.bucketName, "zh-CN")
        || left.objectKey.localeCompare(right.objectKey, "zh-CN")
    })
  }, [filteredFiles, sort])

  const pageCount = Math.max(1, Math.ceil(sortedFiles.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const rows = sortedFiles.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const firstRow = sortedFiles.length === 0 ? 0 : safePage * pageSize + 1
  const lastRow = Math.min((safePage + 1) * pageSize, sortedFiles.length)

  const changeSort = (key: SortKey) => {
    setSort((current) => {
      if (current?.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" }
      }
      return { key, direction: key === "lastModified" ? "desc" : "asc" }
    })
    setPage(0)
  }

  const generateDownloadLink = async (file: FlatBucketFile) => {
    if (!isAdmin || generatingFileId) return
    setGeneratingFileId(file.id)
    try {
      const response = await createAdminObjectDownloadLinkApi(
        serverId,
        { bucket: file.bucketName, object_key: file.objectKey },
        accessToken ?? undefined,
      )
      const rawUrl = response.download_url ?? response.url
      if (!rawUrl) {
        showErrorToast("后端未返回一次性下载链接")
        return
      }
      const resolvedUrl = resolveAdminDownloadUrl(rawUrl)
      if (!resolvedUrl) {
        showErrorToast("后端返回的一次性下载链接不合法")
        return
      }
      setDownloadLink({
        file,
        url: resolvedUrl,
        expiresAt: response.expires_at,
        expiresInSeconds: response.expires_in_seconds,
        singleUse: response.single_use !== false,
      })
    } catch {
      // 错误已由 api client 展示
    } finally {
      setGeneratingFileId(null)
    }
  }

  const copyDownloadLink = async () => {
    if (!downloadLink) return
    const successful = await copyTextToClipboard(downloadLink.url)
    if (!successful) {
      showErrorToast("复制失败，请手动选择并复制")
      return
    }
    showSuccessToast("一次性下载链接已复制")
  }

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
                <TableHead
                  className="w-28 text-right"
                  aria-sort={sort?.key === "size" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    title="按文件大小排序"
                    aria-label={`按文件大小${sort?.key === "size" && sort.direction === "asc" ? "降序" : "升序"}排列`}
                    onClick={() => changeSort("size")}
                  >
                    大小
                    <SortIndicator active={sort?.key === "size"} direction={sort?.direction ?? "asc"} />
                  </button>
                </TableHead>
                <TableHead
                  className="min-w-[170px]"
                  aria-sort={sort?.key === "lastModified" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    title="按最后修改时间排序"
                    aria-label={`按最后修改时间${sort?.key === "lastModified" && sort.direction === "desc" ? "升序" : "降序"}排列`}
                    onClick={() => changeSort("lastModified")}
                  >
                    最后修改
                    <SortIndicator active={sort?.key === "lastModified"} direction={sort?.direction ?? "desc"} />
                  </button>
                </TableHead>
                {isAdmin ? <TableHead className="w-24 pr-3 text-right">操作</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="max-w-[260px] pl-3">
                    <CopyFileName name={file.name} />
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <span className="block truncate font-mono text-[11px] text-muted-foreground" title={file.objectKey}>
                      {file.objectKey}
                    </span>
                  </TableCell>
                  <TableCell>{file.bucketName}</TableCell>
                  <TableCell className="text-right font-mono text-[11px]">{formatBytes(file.size)}</TableCell>
                  <TableCell>{formatDateTime(file.lastModified)}</TableCell>
                  {isAdmin ? (
                    <TableCell className="pr-3">
                      <div className="flex justify-end gap-0.5">
                        <IconTooltip label="查看对象详情">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            aria-label={`查看 ${file.name} 的对象详情`}
                            onClick={() => setDetailTarget(file)}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="生成一次性下载链接">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-md"
                            disabled={Boolean(generatingFileId)}
                            aria-label={`为 ${file.name} 生成一次性下载链接`}
                            aria-busy={generatingFileId === file.id}
                            onClick={() => void generateDownloadLink(file)}
                          >
                            {generatingFileId === file.id ? (
                              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </Button>
                        </IconTooltip>
                      </div>
                    </TableCell>
                  ) : null}
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

      {isAdmin && detailTarget ? (
        <Modal
          title="对象详情"
          onClose={() => setDetailTarget(null)}
          contentClassName="max-w-lg rounded-lg"
        >
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs">
            <dt className="text-muted-foreground">文件名</dt>
            <dd className="min-w-0 break-all font-medium text-foreground">{detailTarget.name}</dd>
            <dt className="text-muted-foreground">存储桶</dt>
            <dd className="break-all text-foreground">{detailTarget.bucketName}</dd>
            <dt className="text-muted-foreground">对象路径</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">{detailTarget.objectKey}</dd>
            <dt className="text-muted-foreground">对象大小</dt>
            <dd className="font-mono text-foreground">
              {formatBytes(detailTarget.size)}
              <span className="ml-1.5 text-muted-foreground">({detailTarget.size.toLocaleString("zh-CN")} B)</span>
            </dd>
            <dt className="text-muted-foreground">最后修改</dt>
            <dd className="text-foreground">{formatDateTime(detailTarget.lastModified)}</dd>
          </dl>
          <div className="mt-5 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetailTarget(null)}>关闭</Button>
          </div>
        </Modal>
      ) : null}

      {isAdmin && downloadLink ? (
        <Modal
          title="一次性下载链接"
          onClose={() => setDownloadLink(null)}
          contentClassName="max-w-lg rounded-lg"
        >
          <div className="space-y-3 text-xs">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="break-all font-medium text-foreground">{downloadLink.file.name}</div>
              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                {downloadLink.file.bucketName}/{downloadLink.file.objectKey}
              </div>
            </div>
            <div className="rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2 leading-relaxed text-amber-800 dark:text-amber-200">
              {downloadLink.singleUse ? "链接首次打开后立即失效，" : "链接可在有效期内使用，"}
              {downloadLink.expiresAt
                ? `最晚有效至 ${formatDateTime(downloadLink.expiresAt)}。`
                : `有效期约 ${formatLinkLifetime(downloadLink.expiresInSeconds)}。`}
              请仅发送给本次运维处理所需的人员。
            </div>
            <div className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-[10px] text-muted-foreground">
              {downloadLink.url}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyDownloadLink()}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              复制链接
            </Button>
            <a
              href={downloadLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setDownloadLink(null)}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              打开并下载
            </a>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
