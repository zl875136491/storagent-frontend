import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../auth/AuthContext"
import { fetchStorageBucketsApi, type StorageBucketItem } from "../../api/client"
import { BucketReplicateGraph } from "../../components/storage/BucketReplicateGraph"
import { Card, CardContent } from "../../components/ui/card"

function getBucketShownName(bucket: StorageBucketItem): string {
  const shownName = bucket.app?.shown_name?.trim()
  return shownName ? shownName : "—"
}

function getBucketDescription(bucket: StorageBucketItem): string {
  const description = bucket.app?.description?.trim()
  return description ? description : "—"
}

export default function StorageBucketManagePage() {
  const { accessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [buckets, setBuckets] = useState<StorageBucketItem[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const resp = await fetchStorageBucketsApi(accessToken ?? undefined)
        setBuckets(resp.data ?? [])
        if (resp.data && resp.data.length > 0) {
          setSelectedName(resp.data[0].name)
        } else {
          setSelectedName(null)
        }
      } catch {
        // 错误已由 api client toast 展示
        setBuckets([])
        setSelectedName(null)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [accessToken])

  const selectedBucket = useMemo(
    () => buckets.find((b) => b.name === selectedName) ?? null,
    [buckets, selectedName],
  )

  return (
    <div className="mx-auto flex h-full max-w-8xl flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">存储桶管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            查看当前系统的存储桶、所属 MinIO Server 与关联应用信息。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/60 border-t-emerald-500" />
            <div>正在加载存储桶...</div>
          </div>
        </div>
      ) : buckets.length === 0 ? (
        <Card className="flex min-h-[160px] flex-col items-center justify-center border-dashed bg-muted/40">
          <CardContent className="flex flex-col items-center gap-2 pt-0">
            <div className="text-sm font-medium text-foreground">暂无存储桶数据</div>
            <div className="text-xs text-muted-foreground">
              请确认后端已配置存储桶，或稍后刷新重试。
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <div className="border-b border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                共 {buckets.length} 个存储桶
              </div>
              <div className="docs-scroll min-h-0 flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                  {buckets.map((bucket) => {
                    const active = bucket.name === selectedName
                    return (
                      <button
                        key={bucket.name}
                        type="button"
                        onClick={() => setSelectedName(bucket.name)}
                        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
                          active
                            ? "bg-emerald-500/10 ring-1 ring-emerald-500/40"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {bucket.name}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {getBucketShownName(bucket)}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {(bucket.servers?.length ?? 0) || 0}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex min-h-0 flex-col gap-4">
            <Card>
              <CardContent className="pt-4">
                {!selectedBucket ? (
                  <div className="flex min-h-[120px] items-center justify-center text-xs text-muted-foreground">
                    请在左侧选择一个存储桶。
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-foreground">
                          {selectedBucket.name}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          应用：{getBucketShownName(selectedBucket)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(selectedBucket.servers ?? []).length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">
                            未绑定 MinIO Server
                          </span>
                        ) : (
                          (selectedBucket.servers ?? []).map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center rounded-full border border-border bg-background px-2 py-1 text-[11px] text-foreground/80"
                            >
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground/80">
                          应用显示名
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {getBucketShownName(selectedBucket)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground/80">
                          应用描述
                        </div>
                        <div className="mt-1 text-sm text-foreground">
                          {getBucketDescription(selectedBucket)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-dashed bg-muted/20">
              <CardContent className="flex min-h-0 flex-1 flex-col p-2 pt-2">
                {selectedBucket ? (
                  <BucketReplicateGraph
                    bucketName={selectedBucket.name}
                    accessToken={accessToken ?? undefined}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">选择存储桶后显示复制拓扑。</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

