import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Loader2, Server } from "lucide-react"

import {
  fetchPublicEndpointsApi,
  getApiBaseUrl,
  setApiBaseUrl,
  type PublicEndpointItem,
} from "@/api/client"
import { setStoredApiBase } from "@/api/apiBaseStorage"
import { cn } from "@/lib/utils"

function normalizeEndpoint(url: string): string {
  return url.trim().replace(/\/$/, "")
}

export function BackendEndpointSwitcher() {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PublicEndpointItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const selected = items.find((it) => normalizeEndpoint(it.endpoint) === currentBase)

  const handlePick = (item: PublicEndpointItem) => {
    const next = normalizeEndpoint(item.endpoint)
    if (next === currentBase) {
      setOpen(false)
      return
    }
    setApiBaseUrl(next)
    setStoredApiBase(next)
    setOpen(false)
    window.location.reload()
  }

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-[min(100%,48rem)] flex-1">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={loading && items.length === 0}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-muted/30 px-2.5 py-1.5 text-left transition-colors",
          "hover:border-primary/40 hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          (loading && items.length === 0) && "pointer-events-none opacity-60",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Server className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
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
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] leading-tight">
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
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={selected.endpoint}>
                {selected.endpoint}
              </span>
              {selected.master ? (
                <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                  主
                </span>
              ) : null}
            </div>
          ) : currentBase ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] leading-tight">
              <span className="shrink-0 font-medium text-foreground">当前</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {currentBase}
              </span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-muted-foreground">未选择</div>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="选择后端服务"
          className="absolute left-0 top-[calc(100%+6px)] z-[100] max-h-[min(70vh,18rem)] w-[min(100vw-2rem,48rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-border/80 bg-popover p-1 shadow-lg"
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
                const active = normalizeEndpoint(item.endpoint) === currentBase
                return (
                  <li key={`${item.server_id}-${item.endpoint}`} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => handlePick(item)}
                      className={cn(
                        "grid w-full min-w-0 grid-cols-[minmax(0,auto)_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 rounded-lg px-2 py-1.5 text-left transition-colors sm:gap-x-3",
                        "hover:bg-accent/80",
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
                        title={item.endpoint}
                      >
                        {item.endpoint}
                      </span>
                      {item.master ? (
                        <span className="justify-self-end rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                          主
                        </span>
                      ) : (
                        <span className="justify-self-end w-5 shrink-0" aria-hidden />
                      )}
                    </button>
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
