import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Loader2, Server } from "lucide-react"

import {
  fetchProfileApi,
  fetchPublicEndpointsApi,
  getApiBaseUrl,
  setApiBaseUrl,
  type PublicEndpointItem,
} from "@/api/client"
import { apiBaseForEndpoint, probeBackendEndpointReachable } from "@/api/backendResolver"
import { setStoredApiBase } from "@/api/apiBaseStorage"
import { showErrorToast } from "@/api/toast"
import { cn } from "@/lib/utils"

const ACCESS_TOKEN_KEY = "cross_storage_access_token"
const REFRESH_TOKEN_KEY = "cross_storage_refresh_token"

function normalizeEndpoint(url: string): string {
  return url.trim().replace(/\/$/, "")
}

/** 切换后端后校验会话；无效则清空本地 token，强制重新登录 */
async function validateSessionOrClear(): Promise<boolean> {
  const access = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!access) return true
  try {
    await fetchProfileApi(access)
    return true
  } catch {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    return false
  }
}

export function BackendEndpointSwitcher() {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PublicEndpointItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const currentBase = normalizeEndpoint(getApiBaseUrl())

  const loadEndpoints = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const resp = await fetchPublicEndpointsApi()
      setItems(resp.data ?? [])
    } catch {
      setLoadError("无法加载后端列表")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEndpoints()
  }, [loadEndpoints])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const selected = items.find((it) => normalizeEndpoint(apiBaseForEndpoint(it)) === currentBase)

  const handlePick = async (item: PublicEndpointItem) => {
    const next = normalizeEndpoint(apiBaseForEndpoint(item))
    if (next === currentBase) {
      setOpen(false)
      return
    }
    setSwitching(true)
    try {
      const ok = await probeBackendEndpointReachable(next)
      if (!ok) {
        showErrorToast("该后端不可达：无法访问 /api/v1/public/endpoints，请检查网络或地址后重试")
        return
      }
      setApiBaseUrl(next)
      setStoredApiBase(next)
      setOpen(false)
      const sessionOk = await validateSessionOrClear()
      if (!sessionOk) {
        showErrorToast("已切换后端，原登录态在该节点无效，请重新登录")
      }
      // Keep the shell and current document mounted. A full reload briefly
      // blanked the whole page while the new backend was being probed again.
      // AuthProvider listens for this event and refreshes the in-memory user.
      window.dispatchEvent(new CustomEvent("storagent:backend-changed", { detail: { base: next } }))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:max-w-[min(100%,48rem)]">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={(loading && items.length === 0) || switching}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-xl border border-border/80 bg-muted/30 px-2 py-1 text-left transition-colors sm:gap-2 sm:px-2.5 sm:py-1.5",
          "hover:border-primary/40 hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ((loading && items.length === 0) || switching) && "pointer-events-none opacity-60",
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-7 sm:w-7">
          <Server className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[9px]">
            后端服务
          </div>
          {loading && items.length === 0 ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              加载中…
            </div>
          ) : loadError ? (
            <div className="mt-0.5 truncate text-xs text-destructive">{loadError}</div>
          ) : selected ? (
            <>
              <div
                className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight sm:hidden"
                title={`${selected.name} · ${apiBaseForEndpoint(selected)}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {selected.shown_name}
                </span>
                {selected.master ? (
                  <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                    主
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 hidden min-w-0 items-center gap-2 text-[11px] leading-tight sm:flex">
                <span className="shrink-0 font-semibold text-foreground">{selected.shown_name}</span>
                <span className="shrink-0 text-muted-foreground/40" aria-hidden>
                  |
                </span>
                <span className="max-w-[5.5rem] shrink-0 truncate text-muted-foreground" title={selected.name}>
                  {selected.name}
                </span>
                <span className="shrink-0 text-muted-foreground/40" aria-hidden>
                  |
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground"
                  title={apiBaseForEndpoint(selected)}
                >
                  {apiBaseForEndpoint(selected)}
                </span>
                {selected.master ? (
                  <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                    主
                  </span>
                ) : null}
              </div>
            </>
          ) : currentBase ? (
            <>
              <div
                className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground sm:hidden"
                title={currentBase}
              >
                {currentBase}
              </div>
              <div className="mt-0.5 hidden min-w-0 items-center gap-2 text-[11px] leading-tight sm:flex">
                <span className="shrink-0 font-medium text-foreground">当前</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                  {currentBase}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-0.5 text-xs text-muted-foreground">未选择</div>
          )}
        </div>
        {switching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="选择后端服务"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[min(70vh,18rem)] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
        >
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-muted-foreground">暂无可用后端</div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = normalizeEndpoint(apiBaseForEndpoint(item)) === currentBase
                return (
                  <li key={`${item.server_id}-${item.domain ?? item.endpoint}`} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={switching}
                      onClick={() => void handlePick(item)}
                      className={cn(
                        "grid w-full min-w-0 grid-cols-[minmax(0,auto)_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 rounded-lg px-2 py-1.5 text-left transition-colors sm:gap-x-3",
                        "hover:bg-accent/80 disabled:pointer-events-none disabled:opacity-50",
                        active && "bg-primary/10 ring-1 ring-primary/25",
                      )}
                    >
                      <span className="truncate text-sm font-semibold text-foreground" title={item.shown_name}>
                        {item.shown_name}
                      </span>
                      <span
                        className="max-w-[7rem] truncate text-[11px] text-muted-foreground sm:max-w-[9rem]"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span
                        className="min-w-0 truncate font-mono text-[10px] leading-none text-muted-foreground/95"
                        title={
                          item.minio_endpoint
                            ? `Domain: ${item.domain ?? "未配置"}\nAPI: ${apiBaseForEndpoint(item)}\nMinIO: ${item.minio_endpoint}`
                            : apiBaseForEndpoint(item)
                        }
                      >
                        {apiBaseForEndpoint(item)}
                      </span>
                      {item.master ? (
                        <span className="justify-self-end rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                          主
                        </span>
                      ) : (
                        <span className="justify-self-end w-5 shrink-0" aria-hidden />
                      )}
                    </button>
                    {item.minio_endpoint ? (
                      <div className="px-2 pb-1.5 pl-2 text-[9px] text-muted-foreground/80">
                        MinIO：
                        <span className="font-mono" title={item.minio_endpoint}>
                          {item.minio_endpoint}
                        </span>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
