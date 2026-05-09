import {
  showApiErrorToast,
  showErrorToast,
  showNetworkErrorToast,
  showSuccessToast,
} from "./toast"
import type { PublicEndpointsResponse } from "./backendResolver"

let apiBaseUrl = ""

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
  regions: Region[]
}

export interface ApplicationListResponse {
  data: Application[]
}

export interface ApplicationCreateRequest {
  name: string
  shown_name: string
  description: string
  regions: string[]
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
  access_key: string
  // secret_key: string
}

export interface MinioServerListResponse {
  data: MinioServer[]
}

export interface MinioServerCreateRequest {
  region: string
  name: string
  host: string
  port: number
  access_key: string
  secret_key: string
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
  const headers: HeadersInit = {}
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  try {
    const resp = await fetch(`${requireApiBaseUrl()}${path}`, {
      method: "GET",
      headers,
    })
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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  try {
    const resp = await fetch(`${requireApiBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
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
export type ApplicationApprovalSseStatus = "running" | "ok" | "failed" | "success"

export interface ApplicationApprovalSseEvent {
  step: string
  server_name: string | null
  status: ApplicationApprovalSseStatus
  message: string
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

export async function fetchPublicEndpointsApi(
  accessToken?: string,
): Promise<PublicEndpointsResponse> {
  return apiGet<PublicEndpointsResponse>("/api/public/endpoints", accessToken)
}

export type { PublicEndpointItem, PublicEndpointsResponse } from "./backendResolver"

