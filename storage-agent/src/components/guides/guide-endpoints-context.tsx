/* eslint-disable react-refresh/only-export-components -- 本模块提供 Context 与配套 hooks/工具函数 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { PublicEndpointItem } from "@/api/backendResolver"
import { apiBaseForEndpoint, normalizePublicApiBase, probePublicEndpointTest } from "@/api/backendResolver"
import { fetchPublicEndpointsApi } from "@/api/client"

export type GuideEndpointProbe = { status: "pending" } | { status: "ok"; latencyMs: number } | { status: "fail" }

type GuideEndpointsContextValue = {
  /** 去重后的列表项（同 endpoint 保留 master 或首条） */
  displayItems: PublicEndpointItem[]
  healthByBase: ReadonlyMap<string, GuideEndpointProbe>
  listLoading: boolean
  listError: string | null
  refetch: () => void
}

const GuideEndpointsContext = createContext<GuideEndpointsContextValue | null>(null)

function pickDisplayItems(items: PublicEndpointItem[]): PublicEndpointItem[] {
  const byBase = new Map<string, PublicEndpointItem>()
  for (const it of items) {
    const k = normalizePublicApiBase(apiBaseForEndpoint(it))
    const cur = byBase.get(k)
    if (!cur) {
      byBase.set(k, it)
      continue
    }
    if (it.master && !cur.master) byBase.set(k, it)
  }
  return [...byBase.values()]
}

export function GuideEndpointsProvider({ children }: { children: ReactNode }) {
  const [rawItems, setRawItems] = useState<PublicEndpointItem[]>([])
  const [healthByBase, setHealthByBase] = useState<Map<string, GuideEndpointProbe>>(new Map())
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const probeGen = useRef(0)

  const displayItems = useMemo(() => pickDisplayItems(rawItems), [rawItems])

  const load = useCallback(async () => {
    const gen = (probeGen.current += 1)
    setListError(null)
    setListLoading(true)
    setRawItems([])
    setHealthByBase(new Map())

    try {
      const resp = await fetchPublicEndpointsApi()
      const items = resp.data ?? []
      setRawItems(items)
      const bases = pickDisplayItems(items).map((it) => normalizePublicApiBase(apiBaseForEndpoint(it)))

      const initial = new Map<string, GuideEndpointProbe>()
      for (const b of bases) initial.set(b, { status: "pending" })
      setHealthByBase(initial)
      setListLoading(false)

      for (const base of bases) {
        void probePublicEndpointTest(base).then((r) => {
          if (probeGen.current !== gen) return
          setHealthByBase((prev) => {
            const next = new Map(prev)
            next.set(base, r.ok ? { status: "ok", latencyMs: r.latencyMs } : { status: "fail" })
            return next
          })
        })
      }
    } catch {
      if (probeGen.current !== gen) return
      setListError("无法加载后端列表")
      setRawItems([])
      setHealthByBase(new Map())
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    // load() 在首个 await 前同步置 loading，与全局后端列表加载一致
    void load() // eslint-disable-line react-hooks/set-state-in-effect -- 初始化拉取端点列表
  }, [load])

  const value = useMemo<GuideEndpointsContextValue>(
    () => ({
      displayItems,
      healthByBase,
      listLoading,
      listError,
      refetch: load,
    }),
    [displayItems, healthByBase, listError, listLoading, load],
  )

  return <GuideEndpointsContext.Provider value={value}>{children}</GuideEndpointsContext.Provider>
}

export function useGuideEndpoints(): GuideEndpointsContextValue {
  const ctx = useContext(GuideEndpointsContext)
  if (!ctx) {
    throw new Error("useGuideEndpoints 必须在 GuideEndpointsProvider 内使用")
  }
  return ctx
}

/** 在已探测结果中选时延最低且可达的基址 */
export function pickLowestLatencyBase(health: ReadonlyMap<string, GuideEndpointProbe>): string | null {
  let best: { base: string; ms: number } | null = null
  for (const [base, h] of health) {
    if (h.status !== "ok") continue
    if (!best || h.latencyMs < best.ms) best = { base, ms: h.latencyMs }
  }
  return best?.base ?? null
}

/**
 * 功能组件引导页：自动选中时延最低的后端；用户手动选择后保持不变，
 * 直至当前选中项变为不可达，则回退到当前最优可达项。
 */
export function useGuideDemoBackendSelection() {
  const { healthByBase, listLoading, listError } = useGuideEndpoints()
  const [base, setBaseState] = useState("")
  const manualRef = useRef(false)

  const allProbesDone = useMemo(() => {
    if (healthByBase.size === 0) return false
    for (const h of healthByBase.values()) {
      if (h.status === "pending") return false
    }
    return true
  }, [healthByBase])

  useEffect(() => {
    if (listLoading || listError) return
    setBaseState((prev) => {
      const best = pickLowestLatencyBase(healthByBase)
      if (manualRef.current) {
        if (prev) {
          const st = healthByBase.get(normalizePublicApiBase(prev))
          if (st?.status === "ok") return prev
        }
        manualRef.current = false
        return best ?? ""
      }
      if (allProbesDone && best) {
        return best
      }
      if (prev) {
        const st = healthByBase.get(normalizePublicApiBase(prev))
        if (st?.status === "ok") return prev
      }
      return best ?? ""
    })
  }, [allProbesDone, healthByBase, listError, listLoading])

  const setBase = useCallback((v: string) => {
    manualRef.current = true
    setBaseState(v)
  }, [])

  const hasSelectable = useMemo(() => pickLowestLatencyBase(healthByBase) != null, [healthByBase])

  return { base, setBase, listLoading, listError, hasSelectable }
}
