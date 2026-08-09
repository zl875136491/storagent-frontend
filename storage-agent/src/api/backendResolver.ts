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
  /** 对外 Nginx 网关域名 */
  domain?: string
  /** 基于 domain 生成的 Storagent API 网关地址 */
  endpoint: string
  /** MinIO 直连地址（可选，新后端提供） */
  minio_endpoint?: string
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

/**
 * 生产环境通过本机 DNS 将 stor.1oa.com.cn 解析到当前区域的宿主 Nginx。
 * 浏览器始终请求同源网关路径，Nginx 再根据该短码转发到目标区域。
 */
const REGION_GATEWAY_SEGMENTS: Record<string, string> = {
  beijing: "bj",
  tianjin: "tj",
  kunshan: "ks",
  shenzhen: "sz",
  hangzhou: "hz",
  local: "local",
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, "")
}

/** 公共 API 基址规范化（与列表项 `endpoint` 一致） */
export function normalizePublicApiBase(url: string): string {
  return normalizeBase(url)
}

/**
 * 对外 endpoints 已以 domain 网关地址为准。生产页面通过同源路径访问时，
 * 保留其路径形式；域名缺失的旧服务才使用 endpoint 兼容回退。
 */
export function apiBaseForEndpoint(endpoint: Pick<PublicEndpointItem, "name" | "domain" | "endpoint">): string {
  const domain = endpoint.domain?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  const segment = REGION_GATEWAY_SEGMENTS[endpoint.name.trim().toLowerCase()]
  if (domain && segment) {
    return `${window.location.protocol}//${domain}/server/${segment}`
  }
  return normalizeBase(endpoint.endpoint)
}

/**
 * Interactive documentation calls through the browser's current origin.
 * The regional prefix lets Nginx route a request without switching domains,
 * keeping authenticated demo requests free of cross-origin preflights.
 */
export function sameOriginGatewayBaseForEndpoint(
  endpoint: Pick<PublicEndpointItem, "name" | "endpoint">,
): string {
  const segment = REGION_GATEWAY_SEGMENTS[endpoint.name.trim().toLowerCase()]
  if (segment) return `/server/${segment}`
  return normalizeBase(endpoint.endpoint)
}

/**
 * 将 locate 返回的绝对 URL 收敛到同源网关。
 * 未登记的区域保留原 URL，避免未知的新区域在前端被错误改写。
 */
export function gatewayUrlForRegion(region: string, url: string): string {
  const segment = REGION_GATEWAY_SEGMENTS[region.trim().toLowerCase()]
  if (!segment) return url
  try {
    const target = new URL(url)
    return `/server/${segment}${target.pathname}${target.search}${target.hash}`
  } catch {
    return url
  }
}

const PUBLIC_ENDPOINT_TEST_PATH = "/api/v1/public/endpoints/test"

/**
 * 对指定基址请求 `GET /api/v1/public/endpoints/test`（约数百字节响应），
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
  // Same-origin gateway bases are paths rather than host URLs. Keeping the
  // original path makes the startup probe list match the Nginx routes users see.
  if (raw.startsWith("/")) return raw
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
  const url = `${normalizeBase(baseUrl)}/api/v1/public/endpoints`
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

/** 切换后端前探测：对目标基址请求 GET /api/v1/public/endpoints，成功解析即视为可达 */
export async function probeBackendEndpointReachable(baseUrl: string): Promise<boolean> {
  const json = await fetchEndpoints(normalizeBase(baseUrl), 12_000)
  return json != null
}

async function tryMasterEndpointFromProbeBase(baseUrl: string): Promise<string | null> {
  const json = await fetchEndpoints(baseUrl, 12_000)
  if (!json?.data?.length) return null
  const master = json.data.find((e) => e.master === true)
  if (!master?.endpoint) return null
  return apiBaseForEndpoint(master)
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
 * 使用 /api/v1/public/endpoints 中 master === true 的 endpoint 作为当前后端。
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

/**
 * 当前后端不可达时，从候选列表中探测并切换到下一个可用节点。
 * 成功则写入 storage 并返回新基址；失败返回 null。
 */
export async function failoverToAlternateBackend(
  candidates: string[],
  currentBase?: string | null,
): Promise<string | null> {
  const current = normalizeBase(currentBase ?? getStoredApiBase() ?? "")
  const probed = new Set<string>()
  if (current) probed.add(current.toLowerCase())

  for (const raw of candidates) {
    const base = normalizeBase(raw)
    if (!base) continue
    const key = base.toLowerCase()
    if (probed.has(key)) continue
    probed.add(key)

    const masterBase = await tryMasterEndpointFromProbeBase(base)
    if (masterBase) {
      const masterKey = masterBase.toLowerCase()
      if (masterKey === current.toLowerCase()) continue
      setStoredApiBase(masterBase)
      return masterBase
    }
  }
  return null
}
