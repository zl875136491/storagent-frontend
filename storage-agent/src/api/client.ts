import {
  showApiErrorToast,
  showErrorToast,
  showNetworkErrorToast,
  showSuccessToast,
} from "./toast"
import type { PublicEndpointsResponse } from "./backendResolver"
import { apiBaseForEndpoint, failoverToAlternateBackend } from "./backendResolver"
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

export interface AuthLinkRequest {
  username: string
}

export interface PasswordPairRequest extends AuthLinkRequest {
  password: string
  confirm_password: string
}

export interface CodeLoginRequest extends AuthLinkRequest {
  code: string
}

export interface AuthRequestResponse {
  message: string
  expires_in_seconds: number
  delivery_status: "sent" | "unknown"
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
  /** 与后端 `/api/v1/auth/profile` 一致，用于前端权限展示 */
  is_admin: boolean
  roles: Role[]
  permissions: string[]
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
  quota_bytes: number
  quota_usage_bytes: number
  quota_usage_ratio: number
  quota_usage_updated_at: string | null
  provisioning_status?: "pending" | "provisioning" | "ready" | "failed" | "degraded"
  provisioning_error?: string
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

export interface ApplicationQuotaUpdateRequest {
  quota_bytes: number
}

export interface QuotaAlertRule {
  low_percent: number
  medium_percent: number
  high_percent: number
  block_percent: number
  message_template: string
  updated_at: string
  updated_by: string
}

export interface QuotaAlertRuleUpdateRequest {
  low_percent: number
  medium_percent: number
  high_percent: number
  block_percent: number
  message_template: string
}

export interface ExpansionRequest {
  id: string
  application_name: string
  application_shown_name: string
  applicant_username: string
  reason: string
  add_size_bytes: number
  status: "pending" | "approved" | "rejected"
  reviewer_username: string
  review_note: string
  created_at: string
  reviewed_at: string | null
}

export interface ExpansionRequestListResponse {
  data: ExpansionRequest[]
}

export interface DiagnosticCheck {
  name: string
  status: "passed" | "failed" | "skipped"
  detail: string
  latency_ms: number
}

export interface DiagnosticRun {
  id: string
  run_id: string
  api_version: "v1" | "v2"
  app_name: string
  source_host: string
  network_only: boolean
  overall_status: "passed" | "failed" | "partial"
  checks: DiagnosticCheck[]
  raw_log: string
  created_at: string
}

export interface CapacityTrendPoint {
  captured_at: string
  raw_capacity_bytes: number
  raw_used_bytes: number
  logical_usage_bytes: number
  object_count: number
  archive_bytes: number
}

export interface CapacityRegionItem {
  region: string
  shown_name: string
  raw_capacity_bytes: number
  raw_used_bytes: number
  logical_usage_bytes: number
  object_count: number
  archive_bytes: number
  archived_object_count: number
  expected_replica_count: number
  actual_replica_count: number
  waterline_percent: number
  daily_growth_bytes: number
  estimated_days_to_70: number | null
  estimated_days_to_85: number | null
  estimated_days_to_95: number | null
  risks: string[]
  trend: CapacityTrendPoint[]
}

export interface CapacityPlanningResponse {
  generated_at: string
  data: CapacityRegionItem[]
}

export interface MinioServer {
  id: string
  region: SimpleRegion
  name: string
  /** 对外 Nginx 网关域名；不含协议、端口和路径 */
  domain: string
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
  domain: string
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
  cache_hit: boolean
  cached_at: string
  expires_at: string
  ttl_seconds: number
}

export interface AdminObjectDownloadLinkRequest {
  bucket: string
  object_key: string
}

/** 管理员运维使用的一次性对象下载链接。链接由 Storagent 兑换，不暴露 MinIO 凭证。 */
export interface AdminObjectDownloadLinkResponse {
  message?: string
  download_url?: string
  /** 兼容早期接口字段，正式响应优先使用 download_url。 */
  url?: string
  expires_at?: string | null
  expires_in_seconds?: number
  single_use?: boolean
  filename?: string
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

export type StorageOperationHealth =
  | "healthy"
  | "syncing"
  | "degraded"
  | "critical"
  | "unreachable"

export type ReplicationStatusReasonSeverity =
  | "info"
  | "syncing"
  | "degraded"
  | "critical"
  | "unreachable"

export interface ReplicationStatusReason {
  code: string
  message: string
  value?: unknown
  severity: ReplicationStatusReasonSeverity
}

export type ReplicationResyncStatus =
  | "idle"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "unknown"

export interface ReplicationTargetMetric {
  source: string
  target: string
  arn: string
  endpoint: string
  status: StorageOperationHealth
  status_reasons?: ReplicationStatusReason[]
  online: boolean
  latency_current_ms: number
  latency_average_ms: number
  latency_maximum_ms: number
  total_downtime_seconds: number
  last_online: string | null
  replication_count: number
  completed_bytes: number
  failed_count: number
  failed_bytes: number
  recent_failed_count: number
  recent_failed_bytes: number
  current_rate_bps: number
  resync_status?: ReplicationResyncStatus
  resync_reset_id?: string
  resync_started_at?: string | null
  resync_updated_at?: string | null
  resync_completed_bytes?: number
  resync_object_count?: number
  resync_failed_count?: number
  resync_failed_bytes?: number
  resync_current_object?: string
  resync_error?: string
}

export interface ReplicationSourceMetric {
  server: string
  status: StorageOperationHealth
  status_reasons?: ReplicationStatusReason[]
  reachable: boolean
  command_latency_ms: number
  error: string
  queued_count: number
  queued_bytes: number
  failed_count: number
  failed_bytes: number
  recent_failed_count: number
  recent_failed_bytes: number
  mrf_failed_last_5m: number
  retries_total: number
  current_rate_bps: number
  expected_target_count: number
  actual_target_count: number
  targets: ReplicationTargetMetric[]
}

export interface ReplicationBucketMetric {
  bucket: string
  shown_name: string
  status: StorageOperationHealth
  status_reasons?: ReplicationStatusReason[]
  sources: ReplicationSourceMetric[]
}

export interface ReplicationOperationsResponse {
  generated_at: string
  servers: string[]
  summary: {
    status: StorageOperationHealth
    status_reasons?: ReplicationStatusReason[]
    bucket_count: number
    source_count: number
    reachable_source_count: number
    expected_link_count: number
    actual_link_count: number
    online_link_count: number
    queued_count: number
    queued_bytes: number
    failed_count: number
    failed_bytes: number
    recent_failed_count: number
    recent_failed_bytes: number
    mrf_failed_last_5m: number
    current_rate_bps: number
  }
  buckets: ReplicationBucketMetric[]
}

export interface ClusterDriveHealth {
  endpoint: string
  path: string
  state: string
  total_bytes: number
  used_bytes: number
  available_bytes: number
  waiting_operations: number
}

export interface ClusterHealthItem {
  id: string
  server: string
  region: string
  shown_name: string
  endpoint: string
  status: "online" | "degraded" | "offline"
  reachable: boolean
  error: string
  checked_at: string
  command_latency_ms: number
  version: string
  uptime_seconds: number
  bucket_count: number
  object_count: number
  version_count: number
  delete_marker_count: number
  logical_usage_bytes: number
  raw_capacity_bytes: number
  raw_used_bytes: number
  online_disks: number
  offline_disks: number
  healing_disks: number
  drives: ClusterDriveHealth[]
}

export interface ClusterHealthResponse {
  generated_at: string
  auto_heal_enabled: boolean
  auto_heal_authority_region: string
  summary: {
    status: "online" | "degraded" | "offline"
    cluster_count: number
    online_clusters: number
    degraded_clusters: number
    offline_clusters: number
    online_disks: number
    offline_disks: number
    healing_disks: number
    raw_capacity_bytes: number
    raw_used_bytes: number
    logical_usage_bytes: number
    object_count: number
  }
  clusters: ClusterHealthItem[]
}

export interface StorageOperationItem {
  id: string
  kind: "cluster_heal"
  status: "queued" | "running" | "succeeded" | "failed"
  server: string
  bucket: string
  actor: string
  message: string
  result: Record<string, unknown>
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface ReplicationOperationResponse {
  message: string
  bucket: string
  source_server?: string | null
  target_server?: string | null
  detail: Record<string, unknown>
}

export interface ClusterHealStatusResponse {
  server: string
  reachable: boolean
  status: string
  scanned_items: number
  offline_nodes: string[]
  heal_disks: Array<Record<string, unknown>>
  sets: Array<Record<string, unknown>>
  error: string
  checked_at: string
  latest_operation: StorageOperationItem | null
}

export type AIProviderProtocol = "chat_completions" | "responses"

export interface AIRuntimeConfig {
  enabled: boolean
  configured: boolean
  provider_name: string
  protocol: AIProviderProtocol
  model: string
  models: string[]
  max_steps: number
}

export interface AIProviderAdminConfig {
  provider_name: string
  base_url: string
  api_key_configured: boolean
  api_key_hint?: string | null
  protocol: AIProviderProtocol
  models: string[]
  default_model: string
  enabled: boolean
  system_prompt: string
  max_steps: number
  updated_at?: string | null
  updated_by?: string | null
}

export interface AIProviderUpdateRequest {
  provider_name: string
  base_url: string
  api_key?: string
  clear_api_key?: boolean
  protocol: AIProviderProtocol
  models: string[]
  default_model: string
  enabled: boolean
  system_prompt: string
  max_steps: number
}

export interface AIProviderTestResponse {
  ok: boolean
  model: string
  protocol: AIProviderProtocol
  latency_ms: number
}

export interface UsageApplicationOption {
  name: string
  shown_name: string
}

export interface UsageAPIKeyOption {
  id: string
  hint: string
  app_name: string
  app_shown_name: string
}

export interface UsageOptionsResponse {
  applications: UsageApplicationOption[]
  api_keys: UsageAPIKeyOption[]
}

export interface UsageTotals {
  upload_requests: number
  upload_bytes: number
  download_requests: number
  download_bytes: number
}

export interface UsagePoint extends UsageTotals {
  period_start: string
  app_name: string
  app_shown_name: string
  api_key_id: string
  api_key_hint: string
  region: string
  first_at: string
  last_at: string
}

export interface UsageEventItem {
  id: string
  occurred_at: string
  app_name: string
  app_shown_name: string
  api_key_id: string
  api_key_hint: string
  operation: "upload" | "download"
  bytes_transferred: number
  region: string
}

export interface UsageQueryResponse {
  region: string
  /** 前端跨区域汇总时由公开服务点目录补充 */
  region_name?: string
  start_at: string
  end_at: string
  interval: "hour" | "day"
  totals: UsageTotals
  points: UsagePoint[]
  events: UsageEventItem[]
  truncated: boolean
}

export interface UsageQueryParams {
  start_at: string
  end_at: string
  interval: "hour" | "day"
  app_name?: string
  api_key_id?: string
}

export interface UsageRegionFailure {
  endpoint: string
  region: string
  message: string
}

export interface UsageAcrossRegionsResponse {
  data: UsageQueryResponse[]
  failures: UsageRegionFailure[]
}

export interface AuditEventItem {
  id: string
  action: string
  actor: string
  resource: string
  success: boolean
  detail: string
  region: string
  created_at: string
}

export interface AuditEventListResponse {
  data: AuditEventItem[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export interface AuditEventOptionsResponse {
  actions: string[]
  actors: string[]
  regions: string[]
}

export interface AuditEventQueryParams {
  start_at?: string
  end_at?: string
  action?: string
  actor?: string
  region?: string
  resource?: string
  success?: boolean
  page?: number
  page_size?: number
}

/** 存储桶跨站点复制规则状态（与 GET …/replicates 一致） */
export interface BucketReplicateRuleStatus {
  status: string
  /** MinIO 规则自身的启停状态；不同于 mc 命令执行状态 status */
  rule_status?: string
  priority: number
  delete_marker_replication: string
  existing_object_replication: string
  source_selection_criteria: string
}

export interface BucketReplicationPolicySummary {
  type: "full_mesh"
  site_count: number
  expected_rule_count: number
  actual_rule_count: number
  healthy_rule_count: number
  complete: boolean
  status: "ready" | "degraded" | string
  missing_rules?: Array<{ from: string; to: string }>
  duplicate_rules?: Array<{ from: string; to: string; count: number }>
  unhealthy_rules?: Array<{ from: string; to: string }>
  unexpected_rules?: Array<{ from: string; to: string }>
  unmapped_rule_count?: number
  read_errors?: Record<string, string>
}

/** 复制拓扑边上：连线从 from 节点的哪一侧离开 / 进入 to 节点的哪一侧（与 UI 一致，便于存后端） */
export type ReplicateSide = "top" | "right" | "bottom" | "left"

/** GET replicates 图中连接桩方位（与 POST …/bucket-edge-position 一致）；对应画布 Handle 为 up→top、down→bottom */
export type ReplicateGraphPortPosition = "up" | "down" | "left" | "right"

export interface BucketGraphServerCoords {
  position_x: number
  position_y: number
}

/** 新版：各站点节点在拓扑图中的画布像素坐标 */
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
 * 与 GET `/api/v1/storage/buckets/{name}/replicates` 一并返回的可选布局快照（version 便于演进）。
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
  /** 旧版：站点 id 列表；新版：站点 id → 像素坐标（仅含已落盘位置） */
  servers: string[] | BucketReplicateServersMap
  /** 全部相关站点 id（含尚无落盘坐标的站点）；优先于 servers 键集合 */
  server_ids?: string[]
  replicates: BucketReplicateRule[]
  /** 后端基于 MinIO 实际规则计算的全连接策略验收摘要 */
  policy?: BucketReplicationPolicySummary
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

  const timeoutMs = (
    path.startsWith("/api/v1/ai/")
    || path.startsWith("/api/v1/storage/operations/")
    || (/^\/api\/v1\/storage\/[^/]+\/details/.test(path))
  ) ? 120_000 : 30_000
  const nodeLocalAuthRequest = [
    "/api/v1/auth/register/request",
    "/api/v1/auth/password-reset/request",
    "/api/v1/auth/login-link/request",
  ].includes(path)
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
      !path.startsWith("/api/v1/auth/login") &&
      !path.startsWith("/api/v1/auth/refresh")
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
    if (isNetwork && !failoverRetried && !nodeLocalAuthRequest) {
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
  return apiPost<LoginRequest, TokenResponse>("/api/v1/auth/login", payload)
}

export async function requestRegistrationApi(
  payload: PasswordPairRequest,
): Promise<AuthRequestResponse> {
  return apiPost<PasswordPairRequest, AuthRequestResponse>(
    "/api/v1/auth/register/request",
    payload,
  )
}

export async function requestPasswordResetApi(
  payload: PasswordPairRequest,
): Promise<AuthRequestResponse> {
  return apiPost<PasswordPairRequest, AuthRequestResponse>(
    "/api/v1/auth/password-reset/request",
    payload,
  )
}

export async function requestLoginLinkApi(
  payload: AuthLinkRequest,
): Promise<AuthRequestResponse> {
  return apiPost<AuthLinkRequest, AuthRequestResponse>(
    "/api/v1/auth/login-link/request",
    payload,
  )
}

interface CodeLoginSuccess {
  baseUrl: string
  tokens: TokenResponse
}

async function loginByCodeAtBackend(
  baseUrl: string,
  payload: CodeLoginRequest,
): Promise<CodeLoginSuccess> {
  const base = baseUrl.trim().replace(/\/$/, "")
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${base}/api/v1/auth/login-by-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      const parsed = parseApiErrorBody(text)
      const detail = typeof parsed?.data === "string" ? parsed.data : parsed?.msg
      throw new Error(detail || `认证失败 (${response.status})`)
    }
    return {
      baseUrl: base,
      tokens: JSON.parse(text) as TokenResponse,
    }
  } finally {
    window.clearTimeout(timer)
  }
}

export async function loginByCodeAcrossBackends(
  payload: CodeLoginRequest,
): Promise<TokenResponse> {
  const candidates = [getApiBaseUrl(), ...CANDIDATE_SERVER_LIST]
  const unique = [...new Set(
    candidates
      .map((item) => item.trim().replace(/\/$/, ""))
      .filter(Boolean),
  )]
  if (unique.length === 0) {
    throw new Error("没有可用的认证后端")
  }

  try {
    const result = await Promise.any(
      unique.map((baseUrl) => loginByCodeAtBackend(baseUrl, payload)),
    )
    setApiBaseUrl(result.baseUrl)
    setStoredApiBase(result.baseUrl)
    return result.tokens
  } catch (error) {
    if (error instanceof AggregateError) {
      const detail = error.errors.find((item) => item instanceof Error) as Error | undefined
      throw new Error(detail?.message || "认证链接无效、已过期或已经使用")
    }
    throw error
  }
}

export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  return apiPost<{ refresh_token: string }, TokenResponse>("/api/v1/auth/refresh", {
    refresh_token: refreshToken,
  })
}

export async function fetchProfileApi(accessToken: string): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/v1/auth/profile", accessToken)
}

export interface AdminUserItem {
  id: string
  username: string
  name: string
  is_admin: boolean
  roles: Role[]
  permissions: string[]
  /** 兼容旧后端，正式界面以 roles 为准。 */
  role_name?: string
  created_at: string
  updated_at: string
}

export interface AdminUserListResponse {
  data: AdminUserItem[]
}

export async function fetchAdminUsersApi(accessToken?: string): Promise<AdminUserListResponse> {
  return apiGet<AdminUserListResponse>("/api/v1/auth/users", accessToken)
}

export async function updateUserRoleApi(
  userId: string,
  roles: string[],
  accessToken?: string,
): Promise<AdminUserItem> {
  return apiPut<{ roles: string[] }, AdminUserItem>(
    `/api/v1/auth/users/${encodeURIComponent(userId)}/role`,
    { roles },
    accessToken,
  )
}

export async function logoutApi(accessToken?: string): Promise<void> {
  try {
    await apiGet("/api/v1/auth/logout", accessToken)
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
  return apiGet<RegionListResponse>("/api/v1/public/region", accessToken)
}

export async function createRegionApi(
  payload: RegionCreateRequest,
  accessToken?: string,
): Promise<Region> {
  return apiPost<RegionCreateRequest, Region>("/api/v1/public/region", payload, accessToken)
}

export async function fetchMinioServersApi(
  accessToken?: string,
): Promise<MinioServerListResponse> {
  return apiGet<MinioServerListResponse>("/api/v1/storage/minio-server", accessToken)
}

export async function fetchBucketsApi(
  minioServerId: string,
  accessToken?: string,
  refresh = false,
): Promise<BucketsResponse> {
  const suffix = refresh ? "?refresh=true" : ""
  return apiGet<BucketsResponse>(`/api/v1/storage/${minioServerId}/details${suffix}`, accessToken)
}

export async function createAdminObjectDownloadLinkApi(
  minioServerId: string,
  payload: AdminObjectDownloadLinkRequest,
  accessToken?: string,
): Promise<AdminObjectDownloadLinkResponse> {
  return apiPost<AdminObjectDownloadLinkRequest, AdminObjectDownloadLinkResponse>(
    `/api/v1/storage/${encodeURIComponent(minioServerId)}/objects/presigned-download`,
    payload,
    accessToken,
  )
}

export async function fetchStorageBucketsApi(
  accessToken?: string,
): Promise<StorageBucketsResponse> {
  return apiGet<StorageBucketsResponse>("/api/v1/storage/buckets", accessToken)
}

export async function fetchReplicationOperationsApi(
  bucket?: string,
  accessToken?: string,
): Promise<ReplicationOperationsResponse> {
  const query = bucket ? `?bucket=${encodeURIComponent(bucket)}` : ""
  return apiGet<ReplicationOperationsResponse>(
    `/api/v1/storage/operations/replication${query}`,
    accessToken,
  )
}

export async function reconcileReplicationApi(
  bucket: string,
  accessToken?: string,
): Promise<{ message: string }> {
  return apiPost<Record<string, never>, { message: string }>(
    `/api/v1/storage/operations/replication/${encodeURIComponent(bucket)}/reconcile`,
    {},
    accessToken,
  )
}

export async function startReplicationResyncApi(
  bucket: string,
  payload: { source_server: string; target_server: string; older_than?: string | null },
  accessToken?: string,
): Promise<ReplicationOperationResponse> {
  return apiPost<typeof payload, ReplicationOperationResponse>(
    `/api/v1/storage/operations/replication/${encodeURIComponent(bucket)}/resync`,
    payload,
    accessToken,
  )
}

export async function fetchClusterHealthOperationsApi(
  accessToken?: string,
): Promise<ClusterHealthResponse> {
  return apiGet<ClusterHealthResponse>("/api/v1/storage/operations/clusters", accessToken)
}

export async function fetchClusterHealStatusApi(
  server: string,
  accessToken?: string,
): Promise<ClusterHealStatusResponse> {
  return apiGet<ClusterHealStatusResponse>(
    `/api/v1/storage/operations/clusters/${encodeURIComponent(server)}/heal`,
    accessToken,
  )
}

export async function startClusterHealApi(
  server: string,
  accessToken?: string,
): Promise<StorageOperationItem> {
  return apiPost<Record<string, never>, StorageOperationItem>(
    `/api/v1/storage/operations/clusters/${encodeURIComponent(server)}/heal`,
    {},
    accessToken,
  )
}

export async function fetchStorageOperationsApi(
  accessToken?: string,
): Promise<{ data: StorageOperationItem[] }> {
  return apiGet<{ data: StorageOperationItem[] }>(
    "/api/v1/storage/operations/jobs?limit=20",
    accessToken,
  )
}

export async function fetchAIRuntimeConfigApi(
  accessToken?: string,
): Promise<AIRuntimeConfig> {
  return apiGet<AIRuntimeConfig>("/api/v1/ai/config", accessToken)
}

export async function fetchAIProviderAdminConfigApi(
  accessToken?: string,
): Promise<AIProviderAdminConfig> {
  return apiGet<AIProviderAdminConfig>("/api/v1/ai/admin/config", accessToken)
}

export async function updateAIProviderAdminConfigApi(
  payload: AIProviderUpdateRequest,
  accessToken?: string,
): Promise<AIProviderAdminConfig> {
  return apiPut<AIProviderUpdateRequest, AIProviderAdminConfig>(
    "/api/v1/ai/admin/config",
    payload,
    accessToken,
  )
}

export async function testAIProviderAdminConfigApi(
  accessToken?: string,
): Promise<AIProviderTestResponse> {
  return apiPost<Record<string, never>, AIProviderTestResponse>(
    "/api/v1/ai/admin/test",
    {},
    accessToken,
  )
}

/** PageAgent customFetch: keep the upstream API Key on the backend. */
export async function fetchAIChatCompletionProxy(
  _input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return authorizedFetch(
    "/api/v1/ai/openai/v1/chat/completions",
    init ?? { method: "POST" },
  )
}

export async function fetchBucketReplicatesApi(
  bucketName: string,
  accessToken?: string,
): Promise<BucketReplicatesResponse> {
  const q = encodeURIComponent(bucketName)
  return apiGet<BucketReplicatesResponse>(`/api/v1/storage/buckets/${q}/replicates`, accessToken)
}

export async function postBucketGraphNodePosition(
  payload: BucketGraphNodePositionPayload,
  accessToken?: string,
): Promise<BucketGraphNodePositionPayload> {
  return apiPost<BucketGraphNodePositionPayload, BucketGraphNodePositionPayload>(
    "/api/v1/graph/bucket-node-position",
    payload,
    accessToken,
  )
}

export async function postBucketGraphEdgePosition(
  payload: BucketGraphEdgePositionPayload,
  accessToken?: string,
): Promise<BucketGraphEdgePositionPayload> {
  return apiPost<BucketGraphEdgePositionPayload, BucketGraphEdgePositionPayload>(
    "/api/v1/graph/bucket-edge-position",
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
    `/api/v1/graph/bucket-node-position?bucket=${q}`,
    accessToken,
  )
}

export async function fetchBucketGraphEdgePositions(
  bucket: string,
  accessToken?: string,
): Promise<BucketEdgePositionListResponse> {
  const q = encodeURIComponent(bucket)
  return apiGet<BucketEdgePositionListResponse>(
    `/api/v1/graph/bucket-edge-position?bucket=${q}`,
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
    `/api/v1/storage/buckets/${q}/replicates`,
    payload,
    accessToken,
  )
}

export interface BucketReplicateDeleteParams {
  from: string
  to: string
  rule_id?: string
}

export async function deleteBucketReplicateApi(
  bucketName: string,
  params: BucketReplicateDeleteParams,
  accessToken?: string,
): Promise<{ message: string; from: string; to: string; rule_id: string }> {
  const q = encodeURIComponent(bucketName)
  const search = new URLSearchParams({
    from: params.from,
    to: params.to,
  })
  if (params.rule_id) {
    search.set("rule_id", params.rule_id)
  }
  return apiDelete<{ message: string; from: string; to: string; rule_id: string }>(
    `/api/v1/storage/buckets/${q}/replicates?${search.toString()}`,
    accessToken,
  )
}

export async function createMinioServerApi(
  payload: MinioServerCreateRequest,
  accessToken?: string,
): Promise<MinioServer> {
  return apiPost<MinioServerCreateRequest, MinioServer>(
    "/api/v1/storage/minio-server",
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
    `/api/v1/storage/minio-server/${minioServerId}`,
    payload,
    accessToken,
  )
}

export async function fetchApplicationsApi(
  accessToken?: string,
): Promise<ApplicationListResponse> {
  return apiGet<ApplicationListResponse>("/api/v1/public/application", accessToken)
}

export async function createApplicationApi(
  payload: ApplicationCreateRequest,
  accessToken?: string,
): Promise<Application> {
  return apiPost<ApplicationCreateRequest, Application>(
    "/api/v1/public/application",
    payload,
    accessToken,
  )
}

export async function updateApplicationQuotaApi(
  applicationId: string,
  payload: ApplicationQuotaUpdateRequest,
  accessToken?: string,
): Promise<Application> {
  return apiPut<ApplicationQuotaUpdateRequest, Application>(
    `/api/v1/public/application/${encodeURIComponent(applicationId)}/quota`,
    payload,
    accessToken,
  )
}

export async function fetchQuotaAlertRuleApi(accessToken?: string): Promise<QuotaAlertRule> {
  return apiGet<QuotaAlertRule>("/api/v1/public/quota-alert-rule", accessToken)
}

export async function updateQuotaAlertRuleApi(
  payload: QuotaAlertRuleUpdateRequest,
  accessToken?: string,
): Promise<QuotaAlertRule> {
  return apiPut<QuotaAlertRuleUpdateRequest, QuotaAlertRule>(
    "/api/v1/public/quota-alert-rule",
    payload,
    accessToken,
  )
}

export async function fetchExpansionRequestsApi(accessToken?: string): Promise<ExpansionRequestListResponse> {
  return apiGet<ExpansionRequestListResponse>("/api/v1/public/application/expansion-requests", accessToken)
}

export async function createExpansionRequestApi(
  applicationId: string,
  payload: { reason: string; add_size_bytes: number },
  accessToken?: string,
): Promise<ExpansionRequest> {
  return apiPost<typeof payload, ExpansionRequest>(
    "/api/v1/public/application/" + encodeURIComponent(applicationId) + "/expansion-requests",
    payload,
    accessToken,
  )
}

export async function reviewExpansionRequestApi(
  requestId: string,
  payload: { approved: boolean; review_note: string },
  accessToken?: string,
): Promise<ExpansionRequest> {
  return apiPut<typeof payload, ExpansionRequest>(
    "/api/v1/public/application/expansion-requests/" + encodeURIComponent(requestId) + "/review",
    payload,
    accessToken,
  )
}

export async function fetchDiagnosticRunsApi(accessToken?: string): Promise<{ data: DiagnosticRun[] }> {
  return apiGet<{ data: DiagnosticRun[] }>("/api/v1/diagnostics/runs", accessToken)
}

export function diagnosticScriptUrl(version: "v1" | "v2"): string {
  return getApiBaseUrl() + "/api/" + version + "/diagnostics/" + version + "/self-diagnosis"
}

export async function fetchCapacityPlanningApi(accessToken?: string): Promise<CapacityPlanningResponse> {
  return apiGet<CapacityPlanningResponse>("/api/v1/capacity", accessToken)
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
      `${requireApiBaseUrl()}/api/v1/public/application/${applicationId}/approval`,
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
  deleted?: boolean
  destory_by_admin?: boolean
}

export interface APIKeyListResponse {
  data: APIKey[]
}

export interface DemoAPIKey {
  /** Opaque replicated APIKey reference; never the plaintext secret. */
  id: string
  key_hint: string
  application: SimpleApplication
  expired_at: string | null
}

export interface DemoAPIKeyListResponse {
  data: DemoAPIKey[]
}

export async function fetchDemoApiKeysApi(accessToken?: string): Promise<DemoAPIKeyListResponse> {
  return apiGet<DemoAPIKeyListResponse>("/api/v1/demo/api-keys", accessToken)
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
  return apiGet<SimpleApplicationListResponse>("/api/v1/public/application/enabled", accessToken)
}

export async function fetchApiKeysApi(accessToken?: string): Promise<APIKeyListResponse> {
  return apiGet<APIKeyListResponse>("/api/v1/public/api-key", accessToken)
}

export async function createApiKeyApi(
  payload: APIKeyCreateRequest,
  accessToken?: string,
): Promise<APIKey> {
  return apiPost<APIKeyCreateRequest, APIKey>("/api/v1/public/api-key", payload, accessToken)
}

export async function revokeApiKeyApi(
  apiKeyId: string,
  accessToken?: string,
): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/api/v1/public/api-key/${apiKeyId}`, accessToken)
}

export async function fetchPublicEndpointsApi(
  accessToken?: string,
): Promise<PublicEndpointsResponse> {
  return apiGet<PublicEndpointsResponse>("/api/v1/public/endpoints", accessToken)
}

export async function fetchUsageOptionsApi(
  accessToken?: string,
): Promise<UsageOptionsResponse> {
  return apiGet<UsageOptionsResponse>("/api/v1/usage/options", accessToken)
}

export async function fetchAuditEventOptionsApi(
  accessToken?: string,
): Promise<AuditEventOptionsResponse> {
  return apiGet<AuditEventOptionsResponse>("/api/v1/audit/options", accessToken)
}

export async function fetchAuditEventsApi(
  params: AuditEventQueryParams,
  accessToken?: string,
): Promise<AuditEventListResponse> {
  const query = new URLSearchParams()
  if (params.start_at) query.set("start_at", params.start_at)
  if (params.end_at) query.set("end_at", params.end_at)
  if (params.action) query.set("action", params.action)
  if (params.actor) query.set("actor", params.actor)
  if (params.region) query.set("region", params.region)
  if (params.resource) query.set("resource", params.resource)
  if (params.success !== undefined) query.set("success", String(params.success))
  query.set("page", String(params.page ?? 1))
  query.set("page_size", String(params.page_size ?? 50))
  return apiGet<AuditEventListResponse>(`/api/v1/audit/events?${query.toString()}`, accessToken)
}

function buildUsageQuery(params: UsageQueryParams): string {
  const query = new URLSearchParams({
    start_at: params.start_at,
    end_at: params.end_at,
    interval: params.interval,
  })
  if (params.app_name) query.set("app_name", params.app_name)
  if (params.api_key_id) query.set("api_key_id", params.api_key_id)
  return query.toString()
}

async function fetchUsageAtEndpoint(
  endpoint: string,
  region: string,
  regionName: string,
  params: UsageQueryParams,
  accessToken?: string,
): Promise<UsageQueryResponse> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  try {
    const headers = new Headers()
    const token = authTokenGetter?.() ?? accessToken
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/v1/usage?${buildUsageQuery(params)}`,
      { method: "GET", headers, signal: controller.signal },
    )
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      const parsed = parseApiErrorBody(text)
      const detail = typeof parsed?.data === "string" ? parsed.data : parsed?.msg
      throw new Error(detail || `请求失败 (${response.status})`)
    }
    const parsed = JSON.parse(text) as UsageQueryResponse
    return {
      ...parsed,
      region: parsed.region || region,
      region_name: regionName || parsed.region_name || parsed.region || region,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时")
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * 用量事件保留在产生请求的区域数据库；这里按区域选择一个主服务并并发汇总。
 * 单个区域故障时保留其余区域的结果，由页面明确展示缺失范围。
 */
export async function fetchUsageAcrossRegionsApi(
  params: UsageQueryParams,
  accessToken?: string,
): Promise<UsageAcrossRegionsResponse> {
  const endpoints = await fetchPublicEndpointsApi(accessToken)
  const selected = new Map<string, PublicEndpointsResponse["data"][number]>()
  for (const item of endpoints.data) {
    const previous = selected.get(item.region_id)
    if (!previous || (!previous.master && item.master)) {
      selected.set(item.region_id, item)
    }
  }

  if (selected.size === 0) {
    selected.set("current", {
      region_id: "current",
      server_id: "current",
      name: "current",
      shown_name: "当前区域",
      master: true,
      endpoint: requireApiBaseUrl(),
    })
  }

  const targets = [...selected.values()]
  const results = await Promise.allSettled(
    targets.map(async (item) => ({
      item,
      response: await fetchUsageAtEndpoint(
        apiBaseForEndpoint(item),
        item.region_id,
        item.shown_name,
        params,
        accessToken,
      ),
    })),
  )
  const data: UsageQueryResponse[] = []
  const failures: UsageRegionFailure[] = []
  results.forEach((result, index) => {
    const item = targets[index]
    if (result.status === "fulfilled") {
      data.push(result.value.response)
    } else {
      failures.push({
        endpoint: apiBaseForEndpoint(item),
        region: item.shown_name || item.region_id,
        message: result.reason instanceof Error ? result.reason.message : "请求失败",
      })
    }
  })
  return { data, failures }
}

/** 对象在远端副本节点的下载指引 */
export interface ObjectLocationItem {
  region: string
  shown_name: string
  master: boolean
  endpoint: string
  stat_url: string
  stat_method: "POST"
  stat_body: { object_key: string }
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
    `${baseURL.replace(/\/$/, "")}/api/v1/files/object/locate?${qs.toString()}`,
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
