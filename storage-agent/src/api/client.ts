import {
  showApiErrorToast,
  showErrorToast,
  showNetworkErrorToast,
  showSuccessToast,
} from "./toast"
import type { PublicEndpointsResponse } from "./backendResolver"
import { failoverToAlternateBackend } from "./backendResolver"
import { CANDIDATE_SERVER_LIST } from "../config/serverList"
import { setStoredApiBase } from "./apiBaseStorage"

let apiBaseUrl = ""
let failoverInFlight: Promise<string | null> | null = null

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.trim().replace(/\/$/, "")
}

export function getApiBaseUrl(): string {
  return apiBaseUrl
}

function requireApiBaseUrl(): string {
  if (!apiBaseUrl) {
    throw new Error("后端地址尚未就绪")
  }
  return apiBaseUrl
}

async function ensureFailoverBackend(): Promise<string | null> {
  if (!failoverInFlight) {
    failoverInFlight = (async () => {
      const next = await failoverToAlternateBackend(CANDIDATE_SERVER_LIST, apiBaseUrl)
      if (next) {
        setApiBaseUrl(next)
        setStoredApiBase(next)
      }
      return next
    })().finally(() => {
      failoverInFlight = null
    })
  }
  return failoverInFlight
}

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Role {
  id: string
  name: string
}

export interface UserProfile {
  id: string
  username: string
  name: string
  /** 与后端 `/api/auth/profile` 一致，用于前端权限展示 */
  is_admin: boolean
  roles: Role[]
  created_at: string
  updated_at: string
  system_time: string
}

export interface Region {
  id: string
  name: string
  shown_name: string
}

export interface RegionListResponse {
  data: Region[]
}

export interface RegionCreateRequest {
  name: string
  shown_name: string
}

export interface SimpleRegion {
  id: string
  name: string
  shown_name: string
}

export interface ApplicationAuthor {
  id: string
  username: string
  name: string
}

export interface Application {
  id: string
  name: string
  shown_name: string
  description: string
  created_at: string
  updated_at: string
  enabled: boolean
  enabled_at: string | null
  author: ApplicationAuthor
  /** 旧字段，新后端不再返回 */
  regions?: Region[]
}

export interface ApplicationListResponse {
  data: Application[]
}

export interface ApplicationCreateRequest {
  name: string
  shown_name: string
  description: string
}

export interface MinioServer {
  id: string
  region: SimpleRegion
  name: string
  host: string
  /** 对外服务 / 代理端口 */
  server_port: number
  /** MinIO 进程监听端口 */
  minio_port: number
  master?: boolean
  /** 复制集权重 */
  replicate_weight?: number
}

export interface MinioServerListResponse {
  data: MinioServer[]
}

export interface MinioServerCreateRequest {
  region: string
  name: string
  host: string
  server_port: number
  minio_port: number
  access_key: string
  secret_key: string
  replicate_weight?: number
}

export interface MinioServerReplicateWeightPayload {
  replicate_weight: number
}

export interface BucketFileItem {
  name: string
  size: number
  last_modified: string
  children?: BucketFileItem[] | null
}

export interface BucketInfo {
  name: string
  total_size: number
  created_at: string
  files: BucketFileItem[]
}

export interface BucketsResponse {
  data: BucketInfo[]
}

export interface StorageBucketAppInfo {
  shown_name?: string
  description?: string
}

export interface StorageBucketItem {
  name: string
  servers: string[]
  app: StorageBucketAppInfo
}

export interface StorageBucketsResponse {
  data: StorageBucketItem[]
}

/** 存储桶跨站点复制规则状态（与 GET …/replicates 一致） */
export interface BucketReplicateRuleStatus {
  status: string
  priority: number
  delete_marker_replication: string
  existing_object_replication: string
  source_selection_criteria: string
}

/** 复制拓扑边上：连线从 from 节点的哪一侧离开 / 进入 to 节点的哪一侧（与 UI 一致，便于存后端） */
export type ReplicateSide = "top" | "right" | "bottom" | "left"

/** GET replicates 图中连接桩方位（与 POST …/bucket-edge-position 一致）；对应画布 Handle 为 up→top、down→bottom */
export type ReplicateGraphPortPosition = "up" | "down" | "left" | "right"

export interface BucketGraphServerCoords {
  position_x: number
  position_y: number
}

/** 新版：各站点节点在拓扑图中的坐标（可为百分比 0–100 或像素，由数值范围推断） */
export type BucketReplicateServersMap = Record<string, BucketGraphServerCoords>

export interface BucketReplicateRule {
  from: string
  to: string
  /** 边在 `from` 节点上的连接侧；缺省时前端可按几何推断或由 from_position 映射 */
  from_side?: ReplicateSide
  /** 边在 `to` 节点上的连接侧 */
  to_side?: ReplicateSide
  /** API：从 from 节点哪一侧出线（up/down/left/right） */
  from_position?: ReplicateGraphPortPosition
  /** API：进入 to 节点哪一侧 */
  to_position?: ReplicateGraphPortPosition
  status: BucketReplicateRuleStatus
  rule_id: string
}

/**
 * 与 GET `/api/storage/buckets/{name}/replicates` 一并返回的可选布局快照（version 便于演进）。
 * 保存后可还原节点坐标与每条边使用的连接侧。
 */
export interface ReplicateGraphLayoutV1 {
  version: 1
  nodes: Array<{ id: string; x: number; y: number }>
  edges: Array<{
    rule_id: string
    from: string
    to: string
    from_side: ReplicateSide
    to_side: ReplicateSide
  }>
}

export interface BucketReplicatesResponse {
  /** 旧版：站点 id 列表；新版：站点 id → 坐标 */
  servers: string[] | BucketReplicateServersMap
  replicates: BucketReplicateRule[]
  /** 可选：与 replicates 配套的画布布局 */
  layout?: ReplicateGraphLayoutV1
}

export interface BucketGraphNodePositionPayload {
  bucket: string
  server: string
  position_x: number
  position_y: number
}

export interface BucketGraphEdgePositionPayload {
  bucket: string
  from_server: string
  to_server: string
  from_position: ReplicateGraphPortPosition
  to_position: ReplicateGraphPortPosition
}

/** 解析后端统一错误体 `{ msg, data, code }` */
export function parseApiErrorBody(text: string): {
  msg?: string
  data?: unknown
  code?: number
} | null {
  if (!text) return null
  try {
    return JSON.parse(text) as { msg?: string; data?: unknown; code?: number }
  } catch {
    return null
  }
}

type AccessTokenGetter = () => string | null
type AccessTokenRefresher = () => Promise<string | null>

let authTokenGetter: AccessTokenGetter | null = null
let authTokenRefresher: AccessTokenRefresher | null = null

/** 由 AuthProvider 注册，供 api* 在 401 时自动续期 */
export function registerAuthTokenHandlers(handlers: {
  getAccessToken: AccessTokenGetter
  refreshAccessToken: AccessTokenRefresher
}): void {
  authTokenGetter = handlers.getAccessToken
  authTokenRefresher = handlers.refreshAccessToken
}

async function authorizedFetch(
  path: string,
  init: RequestInit,
  accessToken?: string,
  retried = false,
  failoverRetried = false,
): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined)
  const token = accessToken ?? authTokenGetter?.() ?? undefined
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const timeoutMs = 30_000
  const controller = new AbortController()
  const externalSignal = init.signal
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true })
    }
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(`${requireApiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    })
    // 401 / 402（凭据失效类）时尝试 refresh 一次
    if (
      (resp.status === 401 || resp.status === 402) &&
      !retried &&
      authTokenRefresher &&
      !path.startsWith("/api/auth/login") &&
      !path.startsWith("/api/auth/refresh")
    ) {
      const next = await authTokenRefresher()
      if (next) {
        return authorizedFetch(path, init, next, true, failoverRetried)
      }
    }
    return resp
  } catch (e) {
    const isAbort = e instanceof DOMException && e.name === "AbortError"
    const isNetwork = e instanceof TypeError || isAbort
    if (isNetwork && !failoverRetried) {
      const nextBase = await ensureFailoverBackend()
      if (nextBase) {
        return authorizedFetch(path, init, accessToken, retried, true)
      }
    }
    if (isAbort) {
      throw new TypeError("请求超时，请检查网络或后端连通性")
    }
    throw e
  } finally {
    window.clearTimeout(timer)
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort)
    }
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => "")

  if (!response.ok) {
    showApiErrorToast(text, `请求失败，状态码 ${response.status}`)
    throw new Error(text || `请求失败，状态码 ${response.status}`)
  }

  if (response.status === 204) {
    // @ts-expect-error - no body
    return undefined
  }

  const data = text ? (JSON.parse(text) as T & { message?: string }) : undefined
  if (data && typeof (data as { message?: string }).message === "string") {
    showSuccessToast((data as { message: string }).message)
  }
  return data as T
}

export async function apiGet<T>(path: string, accessToken?: string): Promise<T> {
  try {
    const resp = await authorizedFetch(path, { method: "GET" }, accessToken)
    return await handleResponse<T>(resp)
  } catch (e) {
    if (e instanceof TypeError) {
      showNetworkErrorToast()
    }
    throw e
  }
}

export async function apiPost<TRequest, TResponse>(
  path: string,
  body: TRequest,
  accessToken?: string,
): Promise<TResponse> {
  try {
    const resp = await authorizedFetch(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      accessToken,
    )
    return await handleResponse<TResponse>(resp)
  } catch (e) {
    if (e instanceof TypeError) {
      showNetworkErrorToast()
    }
    throw e
  }
}

export async function apiPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
  accessToken?: string,
): Promise<TResponse> {
  try {
    const resp = await authorizedFetch(
      path,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      accessToken,
    )
    return await handleResponse<TResponse>(resp)
  } catch (e) {
    if (e instanceof TypeError) {
      showNetworkErrorToast()
    }
    throw e
  }
}

export async function apiDelete<TResponse = { message: string }>(
  path: string,
  accessToken?: string,
): Promise<TResponse> {
  try {
    const resp = await authorizedFetch(path, { method: "DELETE" }, accessToken)
    return await handleResponse<TResponse>(resp)
  } catch (e) {
    if (e instanceof TypeError) {
      showNetworkErrorToast()
    }
    throw e
  }
}

export async function loginApi(payload: LoginRequest): Promise<TokenResponse> {
  return apiPost<LoginRequest, TokenResponse>("/api/auth/login", payload)
}

export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  return apiPost<{ refresh_token: string }, TokenResponse>("/api/auth/refresh", {
    refresh_token: refreshToken,
  })
}

export async function fetchProfileApi(accessToken: string): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/auth/profile", accessToken)
}

export async function logoutApi(accessToken?: string): Promise<void> {
  try {
    await apiGet("/api/auth/logout", accessToken)
  } catch {
    // ignore logout failure
  }
}

export async function fetchHealthApi(baseUrl?: string): Promise<{
  status: string
  app?: string
  version?: string
  region?: string
}> {
  const base = (baseUrl ?? requireApiBaseUrl()).replace(/\/$/, "")
  const resp = await fetch(`${base}/health`)
  return handleResponse(resp)
}

export async function fetchRegionsApi(accessToken?: string): Promise<RegionListResponse> {
  return apiGet<RegionListResponse>("/api/public/region", accessToken)
}

export async function createRegionApi(
  payload: RegionCreateRequest,
  accessToken?: string,
): Promise<Region> {
  return apiPost<RegionCreateRequest, Region>("/api/public/region", payload, accessToken)
}

export async function fetchMinioServersApi(
  accessToken?: string,
): Promise<MinioServerListResponse> {
  return apiGet<MinioServerListResponse>("/api/storage/minio-server", accessToken)
}

export async function fetchBucketsApi(
  minioServerId: string,
  accessToken?: string,
): Promise<BucketsResponse> {
  return apiGet<BucketsResponse>(`/api/storage/${minioServerId}/details`, accessToken)
}

export async function fetchStorageBucketsApi(
  accessToken?: string,
): Promise<StorageBucketsResponse> {
  return apiGet<StorageBucketsResponse>("/api/storage/buckets", accessToken)
}

export async function fetchBucketReplicatesApi(
  bucketName: string,
  accessToken?: string,
): Promise<BucketReplicatesResponse> {
  const q = encodeURIComponent(bucketName)
  return apiGet<BucketReplicatesResponse>(`/api/storage/buckets/${q}/replicates`, accessToken)
}

export async function postBucketGraphNodePosition(
  payload: BucketGraphNodePositionPayload,
  accessToken?: string,
): Promise<BucketGraphNodePositionPayload> {
  return apiPost<BucketGraphNodePositionPayload, BucketGraphNodePositionPayload>(
    "/api/graph/bucket-node-position",
    payload,
    accessToken,
  )
}

export async function postBucketGraphEdgePosition(
  payload: BucketGraphEdgePositionPayload,
  accessToken?: string,
): Promise<BucketGraphEdgePositionPayload> {
  return apiPost<BucketGraphEdgePositionPayload, BucketGraphEdgePositionPayload>(
    "/api/graph/bucket-edge-position",
    payload,
    accessToken,
  )
}

export interface BucketNodePositionListResponse {
  data: BucketGraphNodePositionPayload[]
}

export interface BucketEdgePositionListResponse {
  data: BucketGraphEdgePositionPayload[]
}

export async function fetchBucketGraphNodePositions(
  bucket: string,
  accessToken?: string,
): Promise<BucketNodePositionListResponse> {
  const q = encodeURIComponent(bucket)
  return apiGet<BucketNodePositionListResponse>(
    `/api/graph/bucket-node-position?bucket=${q}`,
    accessToken,
  )
}

export async function fetchBucketGraphEdgePositions(
  bucket: string,
  accessToken?: string,
): Promise<BucketEdgePositionListResponse> {
  const q = encodeURIComponent(bucket)
  return apiGet<BucketEdgePositionListResponse>(
    `/api/graph/bucket-edge-position?bucket=${q}`,
    accessToken,
  )
}

/** 新建一条复制规则（POST body 与后端约定一致时可再调整字段名） */
export interface BucketReplicateCreatePayload {
  from: string
  to: string
  from_side: ReplicateSide
  to_side: ReplicateSide
  status: BucketReplicateRuleStatus
}

export async function createBucketReplicateApi(
  bucketName: string,
  payload: BucketReplicateCreatePayload,
  accessToken?: string,
): Promise<BucketReplicateRule> {
  const q = encodeURIComponent(bucketName)
  return apiPost<BucketReplicateCreatePayload, BucketReplicateRule>(
    `/api/storage/buckets/${q}/replicates`,
    payload,
    accessToken,
  )
}

export async function createMinioServerApi(
  payload: MinioServerCreateRequest,
  accessToken?: string,
): Promise<MinioServer> {
  return apiPost<MinioServerCreateRequest, MinioServer>(
    "/api/storage/minio-server",
    payload,
    accessToken,
  )
}

export async function updateMinioServerApi(
  minioServerId: string,
  payload: MinioServerReplicateWeightPayload,
  accessToken?: string,
): Promise<MinioServer> {
  return apiPut<MinioServerReplicateWeightPayload, MinioServer>(
    `/api/storage/minio-server/${minioServerId}`,
    payload,
    accessToken,
  )
}

export async function fetchApplicationsApi(
  accessToken?: string,
): Promise<ApplicationListResponse> {
  return apiGet<ApplicationListResponse>("/api/public/application", accessToken)
}

export async function createApplicationApi(
  payload: ApplicationCreateRequest,
  accessToken?: string,
): Promise<Application> {
  return apiPost<ApplicationCreateRequest, Application>(
    "/api/public/application",
    payload,
    accessToken,
  )
}

/** 授权 SSE 单条事件（与后端 data: JSON 一致） */
export type ApplicationApprovalSseStatus =
  | "running"
  | "ok"
  | "failed"
  | "success"
  | "skipped"

export interface ApplicationApprovalSseEvent {
  step: string
  server_name: string | null
  status: ApplicationApprovalSseStatus
  message: string
}

/** SSE step → 中文标签（含跨节点 sync / replicate） */
export const APPROVAL_STEP_LABELS: Record<string, string> = {
  start: "开始",
  validate: "校验",
  bucket_phase: "桶阶段",
  bucket_check: "检查桶",
  bucket_create: "创建桶",
  bucket_versioning: "版本控制",
  persist: "持久化",
  sync: "跨节点同步",
  replicate: "复制规则",
  done: "完成",
}

export function approvalStepLabel(step: string): string {
  return APPROVAL_STEP_LABELS[step] ?? step
}

export interface ApproveApplicationStreamParams {
  applicationId: string
  accessToken?: string
  signal?: AbortSignal
  onEvent: (event: ApplicationApprovalSseEvent) => void
}

function parseSseEventLine(line: string): ApplicationApprovalSseEvent | null {
  const trimmed = line.replace(/\r$/, "").trim()
  if (!trimmed.startsWith("data:")) return null
  const json = trimmed.slice(5).trim()
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const o = parsed as Record<string, unknown>
    if (
      typeof o.step !== "string" ||
      typeof o.status !== "string" ||
      typeof o.message !== "string"
    ) {
      return null
    }
    const serverName = o.server_name
    return {
      step: o.step,
      server_name:
        serverName === null || typeof serverName === "string" ? serverName : null,
      status: o.status as ApplicationApprovalSseStatus,
      message: o.message,
    }
  } catch {
    return null
  }
}

/**
 * 应用授权（SSE）：POST 后读取 `text/event-stream` 风格正文，按行解析 `data: {...}`。
 * 连接保持期间持续回调；流正常结束或中断后 resolve。
 */
export async function approveApplicationStream(
  params: ApproveApplicationStreamParams,
): Promise<void> {
  const { applicationId, accessToken, signal, onEvent } = params
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  let response: Response
  try {
    response = await fetch(
      `${requireApiBaseUrl()}/api/public/application/${applicationId}/approval`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal,
      },
    )
  } catch (e) {
    if (e instanceof TypeError) {
      showNetworkErrorToast()
    }
    throw e
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    showApiErrorToast(text, `请求失败，状态码 ${response.status}`)
    throw new Error(text || `请求失败，状态码 ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    showErrorToast("无法读取授权响应流")
    throw new Error("无法读取授权响应流")
  }

  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split("\n")
      buffer = parts.pop() ?? ""
      for (const part of parts) {
        const ev = parseSseEventLine(part)
        if (ev) onEvent(ev)
      }
    }
    if (buffer.trim()) {
      for (const part of buffer.split("\n")) {
        const ev = parseSseEventLine(part)
        if (ev) onEvent(ev)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export interface SimpleApplication {
  id: string
  name: string
  shown_name: string
  /**
   * 可选：部分接口可能返回应用描述
   */
  description?: string
}

export interface SimpleApplicationListResponse {
  data: SimpleApplication[]
}

export interface APIKey {
  id: string
  key: string
  application: SimpleApplication
  expired_at: string | null
}

export interface APIKeyListResponse {
  data: APIKey[]
}

export interface APIKeyCreateRequest {
  application_id: string
  /**
   * 传递 ISO 日期字符串（例如 2026-03-04），后端按 datetime 解析；
   * 为空或 null 时表示永久有效。
   */
  expired_at: string | null
}

export async function fetchEnabledApplicationsApi(
  accessToken?: string,
): Promise<SimpleApplicationListResponse> {
  return apiGet<SimpleApplicationListResponse>("/api/public/application/enabled", accessToken)
}

export async function fetchApiKeysApi(accessToken?: string): Promise<APIKeyListResponse> {
  return apiGet<APIKeyListResponse>("/api/public/api-key", accessToken)
}

export async function createApiKeyApi(
  payload: APIKeyCreateRequest,
  accessToken?: string,
): Promise<APIKey> {
  return apiPost<APIKeyCreateRequest, APIKey>("/api/public/api-key", payload, accessToken)
}

export async function revokeApiKeyApi(
  apiKeyId: string,
  accessToken?: string,
): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/api/public/api-key/${apiKeyId}`, accessToken)
}

export async function fetchPublicEndpointsApi(
  accessToken?: string,
): Promise<PublicEndpointsResponse> {
  return apiGet<PublicEndpointsResponse>("/api/public/endpoints", accessToken)
}

/** 对象在远端副本节点的下载指引 */
export interface ObjectLocationItem {
  region: string
  shown_name: string
  master: boolean
  endpoint: string
  stat_url: string
  download_url: string
}

export interface ObjectLocateResponse {
  bucket: string
  object_key: string
  current_region: string
  local_exists: boolean
  available_at: ObjectLocationItem[]
}

/** 本节点不存在对象时后端错误码（HTTP 404） */
export const OBJECT_NOT_FOUND_LOCAL_CODE = 404032
export const OBJECT_NOT_FOUND_LOCAL_MSG = "对象在本节点不存在"

export interface ObjectNotFoundLocalData {
  bucket: string
  object_key: string
  current_region: string
  available_at: ObjectLocationItem[]
}

export async function locateObjectApi(
  baseURL: string,
  apiKey: string,
  objectKey: string,
  offset = 0,
  length = 0,
): Promise<ObjectLocateResponse> {
  const qs = new URLSearchParams({
    object_key: objectKey,
    offset: String(offset),
    length: String(length),
  })
  const resp = await fetch(
    `${baseURL.replace(/\/$/, "")}/api/files/object/locate?${qs.toString()}`,
    { method: "GET", headers: { "x-api-key": apiKey } },
  )
  return handleResponse<ObjectLocateResponse>(resp)
}

/**
 * 从失败响应中解析跨区下载指引。
 * 优先匹配业务 code=404032，兼容旧版仅靠中文 msg。
 */
export function extractCrossRegionLocations(errorText: string): ObjectLocationItem[] | null {
  const body = parseApiErrorBody(errorText)
  if (!body) return null
  const data = body.data as ObjectNotFoundLocalData | undefined
  if (!data || !Array.isArray(data.available_at) || data.available_at.length === 0) {
    return null
  }
  const codeMatch = body.code === OBJECT_NOT_FOUND_LOCAL_CODE
  const msgMatch = body.msg === OBJECT_NOT_FOUND_LOCAL_MSG
  if (!codeMatch && !msgMatch) {
    // 若有 available_at 结构仍视为跨区指引（防御性）
    if (!("available_at" in data)) return null
  }
  return data.available_at
}

export type { PublicEndpointItem, PublicEndpointsResponse } from "./backendResolver"

