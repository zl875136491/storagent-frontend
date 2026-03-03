import {
  showApiErrorToast,
  showNetworkErrorToast,
  showSuccessToast,
} from "./toast"

const API_BASE_URL = "http://10.32.12.110:6783"

export interface LoginRequest {
  username: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserProfile {
  id: string
  username: string
  name: string
  roles: string[]
  created_at: string
  updated_at: string
  system_time: string
}

export interface Region {
  id: string
  name: string
  nickname: string
}

export interface RegionListResponse {
  data: Region[]
}

export interface RegionCreateRequest {
  name: string
  nickname: string
}

export interface SimpleRegion {
  id: string
  name: string
}

export interface ApplicationAuthor {
  id: string
  username: string
  name: string
}

export interface Application {
  id: string
  name: string
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
  description: string
  regions: string[]
}

export interface MinioServer {
  id: string
  region: SimpleRegion
  name: string
  host: string
  port: number
  access_key: string
  secret_key: string
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
    const resp = await fetch(`${API_BASE_URL}${path}`, {
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
    const resp = await fetch(`${API_BASE_URL}${path}`, {
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


