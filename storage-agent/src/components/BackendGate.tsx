import { type ReactNode, useEffect, useState } from "react"
import { Check, X } from "lucide-react"

import { setApiBaseUrl } from "@/api/client"
import { resolveMasterBackend, type ProbeLine } from "@/api/backendResolver"
import { CANDIDATE_SERVER_LIST } from "@/config/serverList"
import { Button } from "@/components/ui/button"
import { BrandLoading } from "@/components/BrandLoading"

export function BackendGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [probeLines, setProbeLines] = useState<ProbeLine[]>([])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        if (CANDIDATE_SERVER_LIST.length === 0) {
          throw new Error("未在 api.config 中配置 server_list，或构建时未读取到该文件")
        }
        const base = await resolveMasterBackend(CANDIDATE_SERVER_LIST, (lines) => {
          if (!cancelled) setProbeLines(lines)
        })
        if (cancelled) return
        setApiBaseUrl(base)
        setStatus("ready")
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "连接失败")
          setStatus("error")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (status === "ready") {
    return <>{children}</>
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          重新连接
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-foreground">
      <BrandLoading label="正在连接最佳服务" compact iconClassName="h-12 w-12" />
      {probeLines.length > 0 ? (
        <ul className="flex max-w-md flex-col gap-2 text-left text-xs">
          {probeLines.map((line) => (
            <li
              key={line.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] text-foreground"
            >
              {line.status === "pending" ? (
                <span className="inline-block h-3.5 w-3.5 shrink-0 animate-pulse rounded-sm bg-muted-foreground/40" />
              ) : line.status === "fail" ? (
                <X className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
              )}
              <span className="min-w-0 flex-1 break-all">{line.hostLabel}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
