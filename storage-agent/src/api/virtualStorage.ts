export interface VirtualAccountView {
  app_name: string
  display_name: string
  home_region: string
  quota_bytes_total: number
  quota_bytes_allocated: number
  quota_bytes_used: number
  quota_bytes_reserved: number
  quota_bytes_trashed: number
  quota_objects_total: number
  quota_objects_allocated: number
  quota_objects_used: number
  quota_objects_reserved: number
  quota_objects_trashed: number
  revision: number
}

export interface VirtualTenant {
  tenant_id: string
  external_tenant_id: string
  logical_name: string
  generation: number
  state: string
  purge_started: boolean
  quota_bytes_total: number
  quota_bytes_used: number
  quota_bytes_reserved: number
  quota_bytes_trashed: number
  quota_objects_total: number
  quota_objects_used: number
  quota_objects_reserved: number
  quota_objects_trashed: number
  revision: number
}

export interface TenantCreateResult extends VirtualTenant {
  key_id?: string
  key_hint?: string
  api_key?: string
  plaintext_available?: boolean
  delivery_expired?: boolean
  key_expires_at?: string | null
  delivery_expires_at?: string
}

export class VirtualStorageApiError extends Error {
  status: number
  errorCode: string

  constructor(status: number, errorCode: string, message: string) {
    super(message)
    this.status = status
    this.errorCode = errorCode
  }
}

function accountPath(appName: string): string {
  return `/api/virtual-storage/v1/accounts/${encodeURIComponent(appName)}`
}

async function parseError(response: Response): Promise<VirtualStorageApiError> {
  const body = await response.json().catch(() => null) as
    | { message?: string; error_code?: string; detail?: { message?: string; error_code?: string } | string }
    | null
  const detail = body && typeof body.detail === "object" ? body.detail : null
  const message = detail?.message || body?.message || `请求失败 (${response.status})`
  const errorCode = detail?.error_code || body?.error_code || "REQUEST_FAILED"
  return new VirtualStorageApiError(response.status, errorCode, message)
}

async function request<T>(path: string, credential: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${credential}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(path, { ...init, headers })
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function fetchVirtualAccount(appName: string, credential: string) {
  return request<VirtualAccountView>(accountPath(appName), credential)
}

export function fetchVirtualTenants(appName: string, credential: string) {
  return request<VirtualTenant[]>(`${accountPath(appName)}/tenants`, credential)
}

export function createVirtualTenant(
  appName: string,
  credential: string,
  payload: {
    external_tenant_id: string
    logical_name: string
    quota_bytes: number
    quota_objects: number
  },
) {
  return request<TenantCreateResult>(`${accountPath(appName)}/tenants`, credential, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  })
}

export function updateVirtualTenantQuota(
  appName: string,
  credential: string,
  tenant: VirtualTenant,
  quotaBytes: number,
  quotaObjects: number,
) {
  return request<VirtualTenant>(`${accountPath(appName)}/tenants/${tenant.tenant_id}`, credential, {
    method: "PATCH",
    headers: { "If-Match": String(tenant.revision) },
    body: JSON.stringify({ quota_bytes: quotaBytes, quota_objects: quotaObjects }),
  })
}

export interface TenantKeyMeta {
  key_id: string
  key_hint: string
  purpose: string
  enabled: boolean
  expires_at: string
}

export function listTenantKeys(appName: string, credential: string, tenantId: string) {
  return request<TenantKeyMeta[]>(`${accountPath(appName)}/tenants/${tenantId}/api-keys`, credential)
}

export function issueTenantKey(appName: string, credential: string, tenantId: string) {
  return request<TenantCreateResult>(`${accountPath(appName)}/tenants/${tenantId}/api-keys`, credential, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({}),
  })
}

export function revokeTenantKey(appName: string, credential: string, tenantId: string, keyId: string) {
  return request<{ key_id: string; enabled: boolean }>(
    `${accountPath(appName)}/tenants/${tenantId}/api-keys/${keyId}`,
    credential,
    { method: "DELETE" },
  )
}

export async function listTenantObjects(tenantId: string, apiKey: string) {
  const response = await fetch(`/api/virtual-storage/v1/tenants/${encodeURIComponent(tenantId)}/objects`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!response.ok) throw await parseError(response)
  return response.json() as Promise<{ objects: unknown[] }>
}

export function fetchTenantOperation(appName: string, credential: string, operationId: string) {
  return request<{ operation_id: string; state: string; tenant_id: string }>(
    `${accountPath(appName)}/operations/${operationId}`,
    credential,
  )
}

export function postTenantAction(
  appName: string,
  credential: string,
  tenantId: string,
  action: "freeze" | "unfreeze" | "retire" | "cancel-retire",
) {
  return request<VirtualTenant | { operation_id?: string; state: string }>(
    `${accountPath(appName)}/tenants/${tenantId}/${action}`,
    credential,
    { method: "POST" },
  )
}
