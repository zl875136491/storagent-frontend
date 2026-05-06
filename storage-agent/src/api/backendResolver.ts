import {
  clearStoredApiBase,
  getStoredApiBase,
  setStoredApiBase,
} from "./apiBaseStorage"

export interface PublicEndpointItem {
  region_id: string
  server_id: string
  name: string
  shown_name: string
  master: boolean
  endpoint: string
}

export interface PublicEndpointsResponse {
  data: PublicEndpointItem[]
}

export interface ProbeLine {
  id: string
  /** 用于展示的 host:port，例如 10.1.1.164:6783 */
  hostLabel: string
  status: "pending" | "fail" | "success"
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, "")
}

/** 公共 API 基址规范化（与列表项 `endpoint` 一致） */
export function normalizePublicApiBase(url: string): string {
  return normalizeBase(url)
}

const PUBLIC_ENDPOINT_TEST_PATH = "/api/public/endpoints/test"

/**
 * 对指定基址请求 `GET /api/public/endpoints/test`（约数百字节响应），
 * 用于探测连通性；`latencyMs` 为从发起请求到完整读取响应体的耗时。
 */
export async function probePublicEndpointTest(
  baseUrl: string,
  timeoutMs = 20_000,
): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number }> {
  const base = normalizeBase(baseUrl)
  const url = `${base}${PUBLIC_ENDPOINT_TEST_PATH}`
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const t0 = performance.now()
  try {
    const resp = await fetch(url, { method: "GET", signal: controller.signal })
    if (!resp.ok) {
      return { ok: false, latencyMs: performance.now() - t0 }
    }
    await resp.arrayBuffer()
    return { ok: true, latencyMs: performance.now() - t0 }
  } catch {
    return { ok: false, latencyMs: performance.now() - t0 }
  } finally {
    window.clearTimeout(timer)
  }
}

/** 从基址 URL 提取用于展示的 IP/主机与端口 */
export function hostPortLabel(baseUrl: string): string {
  const raw = normalizeBase(baseUrl)
  try {
    const withProto = raw.includes("://") ? raw : `http://${raw}`
    const u = new URL(withProto)
    if (u.port) return `${u.hostname}:${u.port}`
    return u.hostname
  } catch {
    return raw.replace(/^https?:\/\//i, "")
  }
}

async function fetchEndpoints(
  baseUrl: string,
  timeoutMs: number,
): Promise<PublicEndpointsResponse | null> {
  const url = `${normalizeBase(baseUrl)}/api/public/endpoints`
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { method: "GET", signal: controller.signal })
    if (!resp.ok) return null
    return (await resp.json()) as PublicEndpointsResponse
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** 切换后端前探测：对目标基址请求 GET /api/public/endpoints，成功解析即视为可达 */
export async function probeBackendEndpointReachable(baseUrl: string): Promise<boolean> {
  const json = await fetchEndpoints(normalizeBase(baseUrl), 12_000)
  return json != null
}

async function tryMasterEndpointFromProbeBase(baseUrl: string): Promise<string | null> {
  const json = await fetchEndpoints(baseUrl, 12_000)
  if (!json?.data?.length) return null
  const master = json.data.find((e) => e.master === true)
  if (!master?.endpoint) return null
  return normalizeBase(master.endpoint)
}

let probeLineSeq = 0

/** 部分环境（非安全上下文、旧 WebView）无 crypto.randomUUID，需 fallback */
function newProbeLineId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID()
  }
  probeLineSeq += 1
  return `probe-${probeLineSeq}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createProbeState(onLinesUpdate?: (lines: ProbeLine[]) => void) {
  let lines: ProbeLine[] = []

  const emit = () => {
    onLinesUpdate?.([...lines])
  }

  const appendPending = (hostLabel: string): number => {
    const id = newProbeLineId()
    const idx = lines.length
    lines = [...lines, { id, hostLabel, status: "pending" }]
    emit()
    return idx
  }

  const setStatus = (index: number, status: ProbeLine["status"]) => {
    lines = lines.map((l, i) => (i === index ? { ...l, status } : l))
    emit()
  }

  return { appendPending, setStatus }
}

/**
 * 先尝试 localStorage 中的后端；失败则清除并重试 api.config 中的候选。
 * 使用 /api/public/endpoints 中 master === true 的 endpoint 作为当前后端。
 */
export async function resolveMasterBackend(
  candidates: string[],
  onLinesUpdate?: (lines: ProbeLine[]) => void,
): Promise<string> {
  const { appendPending, setStatus } = createProbeState(onLinesUpdate)
  const probedNorm = new Set<string>()

  const probe = async (rawUrl: string): Promise<string | null> => {
    const base = normalizeBase(rawUrl)
    if (!base) return null
    const key = base.toLowerCase()
    if (probedNorm.has(key)) return null
    probedNorm.add(key)

    const lineIndex = appendPending(hostPortLabel(base))
    const masterBase = await tryMasterEndpointFromProbeBase(base)
    if (masterBase) {
      setStatus(lineIndex, "success")
      setStoredApiBase(masterBase)
      return masterBase
    }
    setStatus(lineIndex, "fail")
    return null
  }

  const stored = getStoredApiBase()
  if (stored) {
    const result = await probe(stored)
    if (result) return result
    clearStoredApiBase()
  }

  for (const raw of candidates) {
    const result = await probe(raw)
    if (result) return result
  }

  throw new Error("无法连接任一后端，或未找到主节点（master）")
}
