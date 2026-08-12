import { normalizePublicApiBase, sameOriginGatewayBaseForEndpoint } from "@/api/backendResolver"
import { BrandLoading } from "@/components/BrandLoading"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { pickLowestLatencyBase, useGuideEndpoints, type GuideEndpointProbe } from "./guide-endpoints-context"

type Props = {
  value: string
  onChange: (baseUrl: string) => void
}

/** 时延越大档位越「深」：绿 → 黄 → 橙（阈值可按环境再调） */
function latencyTier(ms: number): "fast" | "mid" | "slow" {
  if (ms <= 120) return "fast"
  if (ms <= 400) return "mid"
  return "slow"
}

const latencyBadgeClass: Record<"fast" | "mid" | "slow", string> = {
  fast:
    "shrink-0 rounded-md bg-emerald-600/14 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/18 dark:text-emerald-300",
  mid:
    "shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-500/22 dark:text-amber-200",
  slow:
    "shrink-0 rounded-md bg-orange-600/22 px-2 py-0.5 text-[11px] font-medium text-orange-950 dark:bg-orange-600/28 dark:text-orange-100",
}

function StatusBadge({ h }: { h: GuideEndpointProbe | undefined }) {
  if (!h || h.status === "pending") {
    return (
      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        检测中
      </span>
    )
  }
  if (h.status === "fail") {
    return (
      <span className="shrink-0 rounded-md bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        失败
      </span>
    )
  }
  const tier = latencyTier(h.latencyMs)
  return (
    <span className={cn(latencyBadgeClass[tier])} title={`${Math.round(h.latencyMs)} ms`}>
      {Math.round(h.latencyMs)} ms
    </span>
  )
}

export function GuideBackendSelector({ value, onChange }: Props) {
  const { displayItems, healthByBase, listLoading, listError } = useGuideEndpoints()

  if (listLoading) {
    return (
      <BrandLoading label="正在加载后端列表..." compact iconClassName="h-5 w-5" />
    )
  }

  if (listError) {
    return <div className="text-xs text-destructive">{listError}</div>
  }

  if (displayItems.length === 0) {
    return <div className="text-xs text-muted-foreground">暂无可用后端</div>
  }

  const anyReachable = pickLowestLatencyBase(healthByBase) != null

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">后端服务</Label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        通过当前页面的区域网关调用 <span className="font-mono">GET /api/v1/public/endpoints/test</span> 探测；不可选项为失败；默认可用时延最低者。
      </p>
      <RadioGroup value={value} onValueChange={onChange} className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {displayItems.map((it) => {
          const base = normalizePublicApiBase(sameOriginGatewayBaseForEndpoint(it))
          const h = healthByBase.get(base)
          const selectable = h?.status === "ok"
          return (
            <RadioGroupItem
              key={`${it.server_id}-${base}`}
              value={base}
              disabled={!selectable}
              title={base}
              className="h-auto w-fit max-w-[min(100%,16rem)] shrink-0 justify-start rounded-lg border px-2 py-1.5 text-left"
            >
              <span className="flex min-w-0 max-w-full items-center gap-2">
                <span className="min-w-0 max-w-[9rem] truncate text-xs font-medium text-foreground sm:max-w-[11rem]">
                  {it.shown_name}
                </span>
                <span className="min-w-0 max-w-[11rem] truncate font-mono text-[10px] text-muted-foreground" title={base}>
                  {it.domain || base}
                </span>
                <StatusBadge h={h} />
              </span>
            </RadioGroupItem>
          )
        })}
      </RadioGroup>
      {!anyReachable && !listLoading ? (
        <div className="text-xs text-destructive">当前无可用后端（探测均未成功），请检查网络或后端服务。</div>
      ) : null}
    </div>
  )
}
